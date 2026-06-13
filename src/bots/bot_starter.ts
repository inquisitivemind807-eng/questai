/**
 * Bot Starter — CLI & Programmatic Entry Point
 * ------------------------------------------------------------------
 * The main orchestrator that ties together the Bot Registry, Workflow
 * Engine, and platform implementations. This is the file that runs
 * when you execute:
 *
 *   bun src/bots/bot_starter.ts <bot_name> [options]
 *
 * Responsibilities:
 *   - Load `.env` manually (bun doesn't auto-load for child processes)
 *   - Discover and validate bots via BotRegistry
 *   - Load bot configuration, selectors, and implementation modules
 *   - Create and configure the WorkflowEngine with YAML + step functions
 *   - Set up emergency cleanup (SIGINT/SIGTERM/exception handlers)
 *   - Handle CLI flags: --url, --jobs, --mode, --limit, --headless, etc.
 *   - Support bulk orchestration (--jobs=id1,id2,id3)
 *   - URL normalization per platform (Seek, LinkedIn, Indeed, Jora)
 *
 * Event streaming:
 *   All bot progress is emitted as [BOT_EVENT] JSON lines on stdout.
 *   The Tauri/Svelte frontend reads these lines to update the dashboard.
 *
 * CLI Examples:
 *   bun src/bots/bot_starter.ts seek
 *   bun src/bots/bot_starter.ts seek --url=https://seek.com.au/job/123
 *   bun src/bots/bot_starter.ts linkedin --mode=review
 *   bun src/bots/bot_starter.ts bulk --jobs=id1,id2 --mode=bot
 */

import { bot_registry, BotRegistry } from './core/registry.js';
import { WorkflowEngine, type WorkflowContext } from './core/workflow_engine.js';
import { killAllChromeProcesses } from './core/browser_manager.js';
import { logger } from './core/logger.js';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// Load .env manually — bun doesn't auto-load .env when spawned as a child process by Tauri
try {
  const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
  // bot_starter.ts is at src/bots/ → .env is at ../../.env (finalboss project root)
  const envPath = path.resolve(__dirname2, '../../.env');
  const altEnvPath = path.resolve(process.cwd(), '.env');
  const resolvedEnvPath = fs.existsSync(envPath) ? envPath : (fs.existsSync(altEnvPath) ? altEnvPath : null);
  if (resolvedEnvPath) {
    const envContent = fs.readFileSync(resolvedEnvPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
    // console.log(`[DEV] [bot_starter] Loaded .env from: ${resolvedEnvPath}`);
  }
} catch (e) {
  console.warn('[bot_starter] Could not load .env:', e);
}

// Ensure stdout is not buffered for real-time event streaming
if (process.stdout.setDefaultEncoding) {
  process.stdout.setDefaultEncoding('utf8');
}
// Disable stdout buffering for immediate event emission
process.stdout.write(''); // Force initialization

const print_log = (message: string) => {
  console.log(message);
};

const normalizeSeekJobUrl = (rawUrl: string): string => {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.hostname.toLowerCase().includes('seek.com.au')) return rawUrl;
    const queryJobId = parsed.searchParams.get('jobId');
    if (queryJobId && /^\d+$/.test(queryJobId)) {
      return `${parsed.protocol}//${parsed.host}/job/${queryJobId}`;
    }
  } catch {
    // Keep original URL if parsing fails.
  }
  return rawUrl;
};

const normalizeIndeedJobUrl = (rawUrl: string): string => {
  if (!rawUrl) return rawUrl;
  if (rawUrl.startsWith('/')) {
    return `https://www.indeed.com${rawUrl}`;
  }
  return rawUrl;
};

const normalizeLinkedInJobUrl = (rawUrl: string): string => {
  if (!rawUrl) return rawUrl;
  if (rawUrl.startsWith('/')) {
    return `https://www.linkedin.com${rawUrl}`;
  }
  return rawUrl;
};

export interface BotRunOptions {
  bot_name: string;
  bot_id?: string;
  config?: any;
  headless?: boolean;
  keep_open?: boolean;
}

/** Reference to the currently running workflow engine (for abort signals). */
let activeWorkflowEngine: WorkflowEngine | null = null;

/**
 * Main orchestrator class. Holds a BotRegistry instance and provides
 * the `run_bot()` method — the single entry point for executing any
 * bot workflow (extract, apply, bulk).
 */
export class BotStarter {
  private registry: BotRegistry;

  constructor(registry?: BotRegistry) {
    this.registry = registry || bot_registry;
  }

  /**
   * Run a single bot workflow from start to finish.
   *
   * Lifecycle:
   *  1. Create session ID + set up logger context
   *  2. Register SIGINT/SIGTERM/exception handlers for graceful shutdown
   *  3. Discover bots, validate bot name, load config + selectors + impl
   *  4. Create WorkflowEngine, register step functions, run
   *  5. Handle post-execution (keep browser open or close)
   *
   * @param options.bot_name  - Name of the bot variant (e.g. 'seek_apply')
   * @param options.bot_id    - Optional override for the auto-generated session ID
   * @param options.config    - User overrides merged into the bot config
   * @param options.headless  - Run browser in headless mode
   * @param options.keep_open - Keep the browser open after workflow completes
   */
  async run_bot(options: BotRunOptions): Promise<void> {
    const { bot_name, bot_id, config, headless = false, keep_open = false } = options;
    const sessionId = logger.createSessionId(bot_name);
    logger.setContext({ sessionId, botName: bot_name });

    // Helper function to check if Chrome is still running
    const checkChromeRunning = async (): Promise<boolean> => {
      try {
        const { execSync } = await import('child_process');
        if (process.platform === 'linux' || process.platform === 'darwin') {
          execSync('pgrep chrome', { stdio: 'ignore' });
          return true;  // Process found
        } else if (process.platform === 'win32') {
          execSync('tasklist /FI "IMAGENAME eq chrome.exe" 2>NUL | find /I "chrome.exe"', { stdio: 'ignore' });
          return true;
        }
      } catch {
        return false;  // Process not found (command returns non-zero)
      }
      return false;
    };

    // Keep reference to context for cleanup
    let context: WorkflowContext | null = null;

    // Setup emergency cleanup handler
    const emergencyCleanup = async (signal: string) => {
      if (activeWorkflowEngine) {
        print_log(`🛑 Aborting workflow via ${signal}...`);
        activeWorkflowEngine.abort();
      }
      print_log(`\n⚠️ Received ${signal} - performing graceful shutdown...`);
      logger.error('bot.emergency_cleanup', 'Emergency cleanup triggered', { signal });

      try {
        // CRITICAL: Gracefully close Chrome FIRST (prevents LOCK files and corruption)
        if (context?.driver) {
          print_log("🔄 Closing Chrome gracefully...");
          try {
            await context.driver.quit();
            print_log("✅ Chrome closed gracefully");

            // Wait for Chrome to actually exit
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (quitError) {
            print_log(`⚠️ Graceful quit failed: ${(quitError as Error).message}`);
          }
        }

        // Only force-kill if Chrome is still running after graceful shutdown
        const stillRunning = await checkChromeRunning();
        if (stillRunning) {
          print_log("⚠️ Chrome still running, force killing...");
          await killAllChromeProcesses();
        } else {
          print_log("✅ Chrome already exited");
        }

        print_log("✅ Cleanup completed");
        logger.info('bot.emergency_cleanup_done', 'Emergency cleanup completed');
      } catch (error) {
        print_log(`❌ Cleanup failed: ${error}`);
        logger.error('bot.emergency_cleanup_failed', 'Emergency cleanup failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
      process.exit(0);  // Exit with 0 (normal termination, not error)
    };

    // Handle Ctrl+C and other termination signals
    process.on('SIGINT', () => emergencyCleanup('SIGINT (Ctrl+C)'));
    process.on('SIGTERM', () => emergencyCleanup('SIGTERM'));

    // Handle uncaught errors
    process.on('uncaughtException', async (error) => {
      print_log(`❌ Uncaught exception: ${error}`);
      logger.error('bot.uncaught_exception', 'Uncaught exception', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      await emergencyCleanup('uncaughtException');
    });

    process.on('unhandledRejection', async (reason) => {
      print_log(`❌ Unhandled rejection: ${reason}`);
      logger.error('bot.unhandled_rejection', 'Unhandled promise rejection', {
        reason: String(reason)
      });
      await emergencyCleanup('unhandledRejection');
    });

    const runStartMs = Date.now();
    try {
      print_log(`[DEV] 🚀 Starting bot runner for: ${bot_name}`);
      logger.info('bot.start', 'Bot runner started', { bot_name, headless, keep_open });


      // 1. Discover and validate bot
      this.registry.discover_bots();

      if (!this.registry.bot_exists(bot_name)) {
        throw new Error(`Bot '${bot_name}' not found. Available bots: ${this.registry.get_bot_names().join(', ')}`);
      }

      const bot_info = this.registry.get_bot_info(bot_name);
      if (!bot_info) {
        throw new Error(`Failed to load bot info for '${bot_name}'`);
      }

      print_log(`[DEV] ✅ Bot validated: ${bot_info.display_name}`);
      logger.info('bot.validated', 'Bot validated', { displayName: bot_info.display_name });

      // 2. Load bot configuration and selectors
      const bot_config = this.registry.load_bot_config(bot_name);
      const bot_selectors = this.registry.load_bot_selectors(bot_name);

      print_log(`[DEV] ⚙️ Configuration and selectors loaded for ${bot_name}`);
      logger.info('bot.config_loaded', 'Bot configuration and selectors loaded');

      // 3. Load bot implementation
      const bot_impl = await this.load_bot_implementation(bot_info.impl_path);

      print_log(`[DEV] 🔧 Implementation loaded for ${bot_name}`);
      logger.info('bot.impl_loaded', 'Bot implementation loaded', { implPath: bot_info.impl_path });

      // 4. Create workflow engine with bot's YAML
      const explicitBotId = bot_id || process.env.BOT_ID;
      const workflow_engine = new WorkflowEngine(bot_info.yaml_path, explicitBotId);
      activeWorkflowEngine = workflow_engine;

      // 5. Register bot's step functions
      this.register_bot_functions(workflow_engine, bot_impl);

      // 6. Setup initial context
      const initial_context = this.create_initial_context(bot_config, bot_selectors, config);

      // 7. Run the workflow
      print_log(`[DEV] ▶️ Executing workflow for ${bot_name}...`);
      workflow_engine.setContext('config', initial_context.config);
      workflow_engine.setContext('selectors', initial_context.selectors);
      workflow_engine.setContext('bot_name', bot_name);
      workflow_engine.setContext('sessionId', sessionId);

      const extractLimit = Number(process.env.BOT_EXTRACT_LIMIT || config?.maxJobsToProcess || config?.extractLimit || config?.extract_limit || config?.formData?.maxJobsToProcess || 0);
      if (extractLimit > 0) {
        workflow_engine.setContext('extract_limit', extractLimit);
      }
      print_log(`[BOT_EVENT] ${JSON.stringify({ type: 'info', timestamp: Date.now(), message: `Bot started: ${bot_info.display_name}`, data: { botId: workflow_engine.getBotId(), botName: bot_name, extractLimit: extractLimit || null } })}`);

      await workflow_engine.run();

      // 8. Handle post-execution
      const final_context = workflow_engine.getContext();
      context = final_context;  // Store for cleanup handler
      await this.handle_post_execution(final_context, keep_open);

      const steps_failed = final_context?._steps_failed?.length ?? 0;
      const steps_passed = (final_context?._steps_executed?.length ?? 0) - steps_failed;

      let result: 'all_pass' | 'partial_pass' | 'all_fail';
      if (steps_failed === 0) result = 'all_pass';
      else if (steps_passed > 0) result = 'partial_pass';
      else result = 'all_fail';

      let mode: string;
      if (bot_name.includes('_apply')) mode = 'apply';
      else mode = 'extract';

      await this.writeRunLog(final_context, bot_name, mode, result, undefined, runStartMs);

      const jobsExtracted = Number(final_context.jobs_extracted || final_context.applied_jobs || 0);
      print_log(`[BOT_EVENT] ${JSON.stringify({ type: 'info', timestamp: Date.now(), message: `Bot completed: ${bot_name}`, data: { botId: workflow_engine.getBotId(), botName: bot_name, jobsProcessed: jobsExtracted, totalJobs: final_context.total_jobs || extractLimit || 0 } })}`);
      print_log(`✅ Bot '${bot_name}' execution completed successfully`);
      logger.info('bot.completed', 'Bot execution completed successfully');

    } catch (error) {
      print_log(`[BOT_EVENT] ${JSON.stringify({ type: 'error', timestamp: Date.now(), message: String(error), data: { botName: bot_name } })}`);
      print_log(`❌ Bot '${bot_name}' execution failed: ${error}`);
      logger.error('bot.failed', 'Bot execution failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      const mode = bot_name.includes('_apply') ? 'apply' : 'extract';
      try {
        await this.writeRunLog(context, bot_name, mode, 'crashed', error instanceof Error ? error.message : String(error), runStartMs);
      } catch (_) {
        // logging failure should never mask the original error
      }
      throw error;
    }
  }

  /**
   * Dynamically import a bot implementation module and extract its
   * step functions. Supports default exports, named export conventions,
   * and raw module objects.
   */
  private async load_bot_implementation(impl_path: string): Promise<any> {
    try {
      const bot_module = await import(impl_path);

      // Look for step functions export
      if (bot_module.default) {
        return bot_module.default;
      } else {
        // Look for named exports (like seekStepFunctions)
        const step_functions = Object.keys(bot_module).find(key =>
          key.includes('StepFunctions') || key.includes('Functions')
        );

        if (step_functions) {
          return bot_module[step_functions];
        }

        return bot_module;
      }
    } catch (error) {
      throw new Error(`Failed to load bot implementation: ${error}`);
    }
  }

  /**
   * Register all exported functions from a bot implementation module
   * with the workflow engine so YAML `func` names can reference them.
   */
  private register_bot_functions(workflow_engine: WorkflowEngine, bot_impl: any): void {
    if (typeof bot_impl === 'object') {
      Object.entries(bot_impl).forEach(([name, func]) => {
        if (typeof func === 'function') {
          workflow_engine.registerStepFunction(name, func as any);
        }
      });
    } else {
      throw new Error('Bot implementation must export an object with step functions');
    }
  }

  /** Merge bot config with user overrides to create the initial workflow context. */
  private create_initial_context(bot_config: any, bot_selectors: any, user_config?: any): any {
    return {
      config: {
        ...bot_config,
        ...user_config // User config overrides bot defaults
      },
      selectors: bot_selectors
    };
  }

  private async writeRunLog(
    context: any,
    bot_name: string,
    mode: string,
    result: string,
    errorMsg?: string,
    runStartMs?: number
  ): Promise<void> {
    try {
      const duration = Date.now() - (runStartMs || Date.now());

      let git_commit = 'unknown';
      try {
        const { execSync } = await import('child_process');
        git_commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
      } catch (_) {}

      let git_branch = 'unknown';
      try {
        const { execSync } = await import('child_process');
        git_branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
      } catch (_) {}

      const jobs_extracted = context?.jobs_extracted ?? 0;
      const jobs_applied = context?.applied_jobs ?? 0;
      const steps_total = context?._steps_executed?.length ?? 0;
      const steps_failed = context?._steps_failed?.length ?? 0;
      const steps_passed = steps_total - steps_failed;

      const failure_types: Record<string, number> = {};
      if (context?._steps_failed) {
        for (const sf of context._steps_failed) {
          const ft = sf?.failure_type ?? 'unknown';
          failure_types[ft] = (failure_types[ft] || 0) + 1;
        }
      }

      const failed_at_step = context?._steps_failed?.[0]?.step ?? null;
      const failure_short = errorMsg ?? context?._steps_failed?.[0]?.error ?? null;
      const url = context?.config?.directApplyUrl ?? null;
      const test_job_id = context?.config?.targetJobId ?? null;
      const preflight = context?._preflight ?? null;

      const logObject = {
        ts: new Date().toISOString(),
        bot: bot_name,
        mode,
        result,
        duration_ms: duration,
        git_commit,
        git_branch,
        jobs_extracted,
        jobs_applied,
        steps_total,
        steps_passed,
        steps_failed,
        failure_types,
        failed_at_step,
        failure_short,
        url,
        test_job_id,
        preflight,
      };

      const dir = path.dirname(fileURLToPath(import.meta.url));
      const logsDir = path.join(dir, 'agent', 'logs');
      fs.mkdirSync(logsDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${bot_name}_${mode}_${timestamp}.jsonl`;
      fs.appendFileSync(path.join(logsDir, filename), JSON.stringify(logObject) + '\n');
    } catch (e) {
      console.error('[writeRunLog] Failed to write run log:', e);
    }
  }

  /**
   * Post-execution cleanup: stop monitoring, close browser (or keep
   * it open if `keep_open` was requested).
   */
  private async handle_post_execution(context: WorkflowContext, keep_open: boolean): Promise<void> {
    // Stop monitoring before closing browser to prevent false recovery attempts
    if (context.driver && context.stopMonitoring) {
      context.stopMonitoring();
      print_log('✅ Stopped browser monitoring');
    }

    // Mark workflow as completed on driver to prevent monitoring from trying to recover
    if (context.driver) {
      try {
        (context.driver as any).__workflowCompleted = true;
      } catch (e) {
        // Ignore if driver is already invalid
      }
    }

    if (context.driver && keep_open) {
      print_log('🎯 Workflow completed! Browser will remain open for you to continue using.');
      if (context.sessionsDir) {
        print_log(`📂 Session saved to: ${context.sessionsDir}`);
      }
      print_log('💡 Press Ctrl+C to exit (browser will stay open) or close browser manually');

      // Keep monitoring browser - only exit when browser closes or Ctrl+C
      // The browser monitoring will handle process exit
    } else if (context.driver) {
      print_log('Closing browser...');
      try {
        await context.driver.quit();
      } catch (e) {
        // Driver might already be closed, that's ok
        print_log('⚠️ Browser already closed or invalid');
      }
    }
  }

  /** Return the list of all discovered bot variant names. */
  get_available_bots(): string[] {
    this.registry.discover_bots();
    return this.registry.get_bot_names();
  }

  /** Check if a bot variant name has been discovered and is valid. */
  validate_bot(bot_name: string): boolean {
    this.registry.discover_bots();
    return this.registry.bot_exists(bot_name);
  }
}

/**
 * Convenience function: run a bot with minimal config.
 * Creates a BotStarter instance and delegates to `run_bot()`.
 */
export async function run_bot(bot_name: string, config?: any, options?: Partial<BotRunOptions>): Promise<void> {
  const bot_starter = new BotStarter();
  await bot_starter.run_bot({
    bot_name,
    config,
    ...options
  });
}

/**
 * Bulk runner: process a list of job IDs in sequence.
 * Each job runs independently; failures in one job do not stop the queue.
 * Failed jobs are marked as 'failed' in the DB.
 *
 * @param jobIds   - Array of MongoDB ObjectId strings
 * @param mode     - Bot mode: 'review' or 'bot'
 * @param superbot - Force 'bot' mode globally (overrides per-job mode)
 */
export async function bulk_run_jobs(jobIds: string[], mode: string, superbot: boolean): Promise<void> {
  print_log(`\n🚀 [BULK RUNNER] Starting queue orchestration for ${jobIds.length} jobs.`);
  print_log(`⚙️ Config: Mode = ${mode}, Superbot = ${superbot}`);

  // Try dynamic import of DB driver to verify jobs
  try {
    const { getDB } = await import('../../../corpus-rag/src/lib/db/mongodb.js');
    const { ObjectId } = await import('mongodb');
    const db = await getDB();

    // Map string IDs to ObjectIds safely
    const objectIds = jobIds.map(id => {
      try { return new ObjectId(id); } catch (e) { return null; }
    }).filter((id): id is import('mongodb').ObjectId => id !== null);

    const jobsCursor = db.collection('jobs').find({ _id: { $in: objectIds } });
    const jobs = await jobsCursor.toArray();
    print_log(`✅ Fetched ${jobs.length} valid jobs from database.`);

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      print_log(`\n======================================================`);
      print_log(`⏳ Processing Job ${i + 1}/${jobs.length}: ${job.title} at ${job.company}`);
      print_log(`======================================================`);

      try {
        const platform = (job.platform || 'seek').toLowerCase();
        let botToRun =
          platform === 'seek'
            ? 'seek_apply'
            : platform === 'linkedin'
              ? 'linkedin_apply'
              : platform === 'indeed'
                ? 'indeed_apply'
                : platform === 'jora'
                  ? 'jora_apply'
                  : platform;

        let botModeConfig = mode;
        if (mode.includes('pauseconfirm')) {
          botToRun += '_pauseconfirm';
          botModeConfig = mode.replace('_pauseconfirm', '');
        }

        // Build the specific bot configuration tailored to this job & user preference
        const normalizedDirectApplyUrl =
          platform === 'seek' && typeof job.url === 'string'
            ? normalizeSeekJobUrl(job.url)
            : platform === 'indeed' && typeof job.url === 'string'
              ? normalizeIndeedJobUrl(job.url)
              : platform === 'linkedin' && typeof job.url === 'string'
                ? normalizeLinkedInJobUrl(job.url)
                : platform === 'jora' && typeof job.url === 'string'
                  ? job.url // Jora uses raw URLs; add normalizer when available
                  : job.url;

        const bot_config = {
          directApplyUrl: normalizedDirectApplyUrl,
          botMode: superbot ? 'bot' : botModeConfig, // Superbot explicitly forces 'bot' mode globally
          targetJobId: job._id.toString()
        };

        print_log(
          `[BOT_EVENT] {"event": "start", "jobId": "${job._id}", "platform": "${platform}", "bot": "${botToRun}"}`
        );

        // Await execution. This is fundamentally resilient because a failed job will 
        // throw an exception that is CAUGHT by this loop, allowing the next iteration.
        await run_bot(botToRun, bot_config, { headless: false, keep_open: false });

        print_log(`✅ [BULK RUNNER] Successfully executed job ${job._id}. moving to next...`);

      } catch (jobError) {
        print_log(`❌ [BULK RUNNER] Job ${job._id} encountered fatal error: ${jobError}`);
        print_log(`[BOT_EVENT] {"event": "error", "jobId": "${job._id}", "error": "${jobError}"}`);

        // Note: DB model should ideally update its own status tracking via workflows now
        await db.collection('jobs').updateOne(
          { _id: job._id },
          { $set: { status: 'failed', lastUpdatedAt: new Date() } }
        );

        print_log(`⚠️ Auto-repair: Handled isolated failure. Recovering queue...`);
        // Continue the loop despite total workflow meltdown
      }
    }

    print_log(`\n🎉 [BULK RUNNER] Finished queue orchestration!`);
  } catch (err) {
    console.error("Critical failure spinning up bulk orchestrator:", err);
  }
}

// CLI usage when run directly
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const bot_starter = new BotStarter();
  const available_bots = bot_starter.get_available_bots();
  const showHelpMenu = async () => {
    try {
      // @ts-ignore - dynamic import for prompts
      const prompts = (await import('prompts')).default;
      
      const choices = available_bots.map(name => ({ title: name, value: name }));
      if (!available_bots.includes('bulk')) {
        choices.push({ title: 'bulk', value: 'bulk' });
      }

      const response = await prompts({
        type: 'select',
        name: 'bot',
        message: 'Select a bot to run:',
        choices: choices,
        initial: 0
      });

      if (response.bot) {
        let jobUrl: string | undefined;
        if (response.bot.includes('_apply') || response.bot === 'linkedin' || response.bot === 'indeed' || response.bot === 'seek' || response.bot === 'jora') {
          const urlResponse = await prompts({
            type: 'text',
            name: 'url',
            message: 'Enter the job URL to apply to (leave blank for search & apply if supported):'
          });
          jobUrl = urlResponse.url;
        }

        const remaining_args = [];
        if (jobUrl) {
          remaining_args.push(`--url=${jobUrl}`);
        }
        await run_bot_by_name(response.bot, remaining_args);
      }
    } catch (e) {
      process.exit(1);
    }
  };

  const run_bot_by_name = async (bot_name: string, remaining_args: string[]) => {
    const is_test_mode = remaining_args.includes('test');
    const is_quicktest_mode = remaining_args.includes('quicktest');
    const headless = remaining_args.includes('--headless');
    const keep_open = remaining_args.includes('--keep-open') || remaining_args.includes('--review');

    // Extract optional extraction limit — env var (from Tauri) takes priority, CLI arg is fallback
    const env_limit = process.env.BOT_EXTRACT_LIMIT;
    const limit_arg = remaining_args.find(a => a.startsWith('--limit='));
    const maxJobsToProcess = env_limit
      ? parseInt(env_limit, 10)
      : limit_arg ? parseInt(limit_arg.split('=')[1], 10) : undefined;

    // Extract specific --url= parameter for Direct Apply from the UI
    const url_arg = remaining_args.find(a => a.startsWith('--url='));
    const job_url = url_arg ? url_arg.substring(url_arg.indexOf('=') + 1) : null;

    // Extract explicit --jobId= parameter for targeting exact existing jobs
    const jobId_arg = remaining_args.find(a => a.startsWith('--jobId='));
    const target_job_id = jobId_arg ? jobId_arg.substring(jobId_arg.indexOf('=') + 1) : null;

    const mode_arg = remaining_args.find(a => a.startsWith('--mode='));
    const mode = mode_arg ? mode_arg.split('=')[1] : 'review';

    // Handle direct URL apply for Seek (Triggered via JobAnalytics UI)
    if (job_url && bot_name.startsWith('seek')) {
      try {
        print_log(`🚀 Starting DIRECT APPLY bot runner for Seek Job: ${job_url}`);
        const normalizedUrl = normalizeSeekJobUrl(job_url);
        const applyBotName = bot_name === 'seek' ? 'seek_apply' : bot_name;
        await run_bot(applyBotName, { directApplyUrl: normalizedUrl, botMode: mode, targetJobId: target_job_id }, { headless, keep_open });
      } catch (error) {
        console.error('Direct Apply execution failed:', error);
        process.exit(1);
      }
    } else if (job_url && (bot_name.startsWith('linkedin') || bot_name.startsWith('indeed'))) {
      try {
        const isIndeed = bot_name.startsWith('indeed');
        const platformName = isIndeed ? 'Indeed' : 'LinkedIn';
        const defaultApplyName = isIndeed ? 'indeed_apply' : 'linkedin_apply';
        
        print_log(`🚀 Starting DIRECT APPLY bot runner for ${platformName} Job: ${job_url}`);
        const normalizedUrl = isIndeed ? normalizeIndeedJobUrl(job_url) : normalizeLinkedInJobUrl(job_url);
        const applyBotName = (bot_name === 'linkedin' || bot_name === 'indeed') ? defaultApplyName : bot_name;
        
        await run_bot(applyBotName, { directApplyUrl: normalizedUrl, botMode: mode, targetJobId: target_job_id }, { headless, keep_open });
      } catch (error) {
        const isIndeed = bot_name.startsWith('indeed');
        console.error(`${isIndeed ? 'Indeed' : 'LinkedIn'} Direct Apply execution failed:`, error);
        process.exit(1);
      }
    } else if (job_url && bot_name.startsWith('jora')) {
      try {
        print_log(`🚀 Starting DIRECT APPLY bot runner for Jora Job: ${job_url}`);
        const applyBotName = bot_name === 'jora' ? 'jora_apply' : bot_name;
        await run_bot(applyBotName, { directApplyUrl: job_url, botMode: mode, targetJobId: target_job_id }, { headless, keep_open });
      } catch (error) {
        console.error('Jora Direct Apply execution failed:', error);
        process.exit(1);
      }
    } else if (is_test_mode && bot_name === 'seek') {
      try {
        const { runQuickApplyTests } = await import('./seek/tests/seek_quick_apply_test');
        await runQuickApplyTests();
      } catch (error) {
        console.error('Test execution failed:', error);
        process.exit(1);
      }
    } else if (is_quicktest_mode && bot_name === 'seek') {
      try {
        const { runQuickApplyE2ETest } = await import('./seek/tests/seek_quick_apply_e2e_test');
        await runQuickApplyE2ETest('https://www.seek.com.au/job/87457750');
      } catch (error) {
        console.error('Quick Apply E2E test execution failed:', error);
        process.exit(1);
      }
    } else if (bot_name === 'bulk') {
      try {
        const jobs_arg = remaining_args.find(a => a.startsWith('--jobs='));
        const superbot_arg = remaining_args.find(a => a.startsWith('--superbot='));

        const job_ids_csv = jobs_arg ? jobs_arg.split('=')[1] : '';
        const superbot = superbot_arg ? superbot_arg.split('=')[1] === 'true' : false;

        const jobIdsArray = job_ids_csv.split(',').filter(Boolean);
        if (jobIdsArray.length === 0) {
          console.error('No jobs provided to bulk orchestrator');
          process.exit(1);
        }

        await bulk_run_jobs(jobIdsArray, mode, superbot);
      } catch (error) {
        console.error('Bulk orchestration failed:', error);
        process.exit(1);
      }
    } else {
      await run_bot(bot_name, { maxJobsToProcess, botMode: mode }, {
        headless,
        keep_open
      }).catch(error => {
        console.error('Bot execution failed:', error);
        process.exit(1);
      });
    }
  };

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelpMenu();
  } else {
    const bot_name = args[0];
    const valid_commands = [...available_bots, 'bulk'];
    if (!valid_commands.includes(bot_name)) {
      console.log('command not found please try -h or --help to list availabel commands. u can check @README.md for currently available commands.');
      process.exit(1);
    }
    run_bot_by_name(bot_name, args.slice(1));
  }
}