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
    console.log(`[bot_starter] Loaded .env from: ${resolvedEnvPath}`);
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

export interface BotRunOptions {
  bot_name: string;
  config?: any;
  headless?: boolean;
  keep_open?: boolean;
}

export class BotStarter {
  private registry: BotRegistry;

  constructor(registry?: BotRegistry) {
    this.registry = registry || bot_registry;
  }

  // Main entry point - like Python's bot_runner.py
  async run_bot(options: BotRunOptions): Promise<void> {
    const { bot_name, config, headless = false, keep_open = true } = options;
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

    try {
      print_log(`🚀 Starting bot runner for: ${bot_name}`);
      logger.info('bot.start', 'Bot runner started', { bot_name, headless, keep_open });

      // Indeed: run standalone Camoufox bot (same UI flow as Seek/LinkedIn)
      if (bot_name === 'indeed') {
        const { spawn } = await import('child_process');
        const botsDir = path.dirname(fileURLToPath(import.meta.url));
        const indeedBotDir = path.resolve(botsDir, 'indeed_bot');
        print_log(`▶️ Running Indeed Camoufox bot from ${indeedBotDir}`);
        const child = spawn('bun', ['run', 'dev'], {
          cwd: indeedBotDir,
          stdio: 'inherit',
          shell: process.platform === 'win32'
        });
        await new Promise<void>((resolve, reject) => {
          child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`indeed_bot exited with ${code}`))));
          child.on('error', reject);
        });
        print_log(`✅ Indeed bot completed`);
        return;
      }

      // 1. Discover and validate bot
      this.registry.discover_bots();

      if (!this.registry.bot_exists(bot_name)) {
        throw new Error(`Bot '${bot_name}' not found. Available bots: ${this.registry.get_bot_names().join(', ')}`);
      }

      const bot_info = this.registry.get_bot_info(bot_name);
      if (!bot_info) {
        throw new Error(`Failed to load bot info for '${bot_name}'`);
      }

      print_log(`✅ Bot validated: ${bot_info.display_name}`);
      logger.info('bot.validated', 'Bot validated', { displayName: bot_info.display_name });

      // 2. Load bot configuration and selectors
      const bot_config = this.registry.load_bot_config(bot_name);
      const bot_selectors = this.registry.load_bot_selectors(bot_name);

      print_log(`⚙️ Configuration and selectors loaded for ${bot_name}`);
      logger.info('bot.config_loaded', 'Bot configuration and selectors loaded');

      // 3. Load bot implementation
      const bot_impl = await this.load_bot_implementation(bot_info.impl_path);

      print_log(`🔧 Implementation loaded for ${bot_name}`);
      logger.info('bot.impl_loaded', 'Bot implementation loaded', { implPath: bot_info.impl_path });

      // 4. Create workflow engine with bot's YAML
      const workflow_engine = new WorkflowEngine(bot_info.yaml_path);

      // 5. Register bot's step functions
      this.register_bot_functions(workflow_engine, bot_impl);

      // 6. Setup initial context
      const initial_context = this.create_initial_context(bot_config, bot_selectors, config);

      // 7. Run the workflow
      print_log(`▶️ Executing workflow for ${bot_name}...`);
      workflow_engine.setContext('config', initial_context.config);
      workflow_engine.setContext('selectors', initial_context.selectors);
      workflow_engine.setContext('bot_name', bot_name);
      workflow_engine.setContext('sessionId', sessionId);

      await workflow_engine.run();

      // 8. Handle post-execution
      const final_context = workflow_engine.getContext();
      context = final_context;  // Store for cleanup handler
      await this.handle_post_execution(final_context, keep_open);

      print_log(`✅ Bot '${bot_name}' execution completed successfully`);
      logger.info('bot.completed', 'Bot execution completed successfully');

    } catch (error) {
      print_log(`❌ Bot '${bot_name}' execution failed: ${error}`);
      logger.error('bot.failed', 'Bot execution failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  // Load bot implementation module
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

  // Register bot's step functions with workflow engine
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

  // Create initial context for workflow
  private create_initial_context(bot_config: any, bot_selectors: any, user_config?: any): any {
    return {
      config: {
        ...bot_config,
        ...user_config // User config overrides bot defaults
      },
      selectors: bot_selectors
    };
  }

  // Handle cleanup and browser management after execution
  private async handle_post_execution(context: WorkflowContext, keep_open: boolean): Promise<void> {
    if (context.driver && keep_open) {
      // Gracefully close browser monitoring when workflow completes
      if (context.stopMonitoring) {
        context.stopMonitoring();
        print_log('✅ Stopped browser monitoring');
      }

      print_log('🎯 Workflow completed! Browser will remain open for you to continue using.');
      if (context.sessionsDir) {
        print_log(`📂 Session saved to: ${context.sessionsDir}`);
      }
      print_log('💡 Press Ctrl+C to exit (browser will stay open) or close browser manually');

      // Keep monitoring browser - only exit when browser closes or Ctrl+C
      // The browser monitoring will handle process exit
    } else if (context.driver) {
      print_log('Closing browser...');
      await context.driver.quit();
    }
  }

  // Get list of available bots
  get_available_bots(): string[] {
    this.registry.discover_bots();
    return this.registry.get_bot_names();
  }

  // Validate bot exists
  validate_bot(bot_name: string): boolean {
    this.registry.discover_bots();
    return this.registry.bot_exists(bot_name);
  }
}

// Convenience function for direct usage
export async function run_bot(bot_name: string, config?: any, options?: Partial<BotRunOptions>): Promise<void> {
  const bot_starter = new BotStarter();
  await bot_starter.run_bot({
    bot_name,
    config,
    ...options
  });
}

// Bulk runner for orchestrating multiple applications resiliently
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

        // Build the specific bot configuration tailored to this job & user preference
        const bot_config = {
          directApplyUrl: job.url,
          botMode: superbot ? 'bot' : mode, // Superbot explicitly forces 'bot' mode globally
          targetJobId: job._id.toString()
        };

        print_log(`[BOT_EVENT] {"event": "start", "jobId": "${job._id}", "platform": "${platform}"}`);

        // Await execution. This is fundamentally resilient because a failed job will 
        // throw an exception that is CAUGHT by this loop, allowing the next iteration.
        await run_bot(platform, bot_config, { headless: false, keep_open: false });

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
if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: bun bot_starter.ts <bot_name> [options]');
    console.log('Example: bun bot_starter.ts seek');
    console.log('Example: bun bot_starter.ts seek test');

    const bot_starter = new BotStarter();
    const available_bots = bot_starter.get_available_bots();
    console.log(`Available bots: ${available_bots.join(', ')}`);
    process.exit(1);
  }

  const bot_name = args[0];
  const is_test_mode = args.includes('test');
  const is_quicktest_mode = args.includes('quicktest');
  const headless = args.includes('--headless');
  const no_keep_open = args.includes('--close');

  // Extract optional extraction limit — env var (from Tauri) takes priority, CLI arg is fallback
  const env_limit = process.env.BOT_EXTRACT_LIMIT;
  const limit_arg = args.find(a => a.startsWith('--limit='));
  const maxJobsToProcess = env_limit
    ? parseInt(env_limit, 10)
    : limit_arg ? parseInt(limit_arg.split('=')[1], 10) : undefined;

  // Extract specific --url= parameter for Direct Apply from the UI
  const url_arg = args.find(a => a.startsWith('--url='));
  const job_url = url_arg ? url_arg.split('=')[1] : null;

  // Handle direct URL apply for Seek (Triggered via JobAnalytics UI)
  if (job_url && bot_name === 'seek') {
    (async () => {
      try {
        print_log(`🚀 Starting DIRECT APPLY bot runner for Seek Job: ${job_url}`);
        const { runQuickApplyE2ETest } = await import('./seek/tests/seek_quick_apply_e2e_test.js');
        await runQuickApplyE2ETest(job_url);
      } catch (error) {
        console.error('Direct Apply execution failed:', error);
        process.exit(1);
      }
    })();
  } else if (job_url && bot_name === 'linkedin') {
    (async () => {
      try {
        print_log(`🚀 Starting DIRECT APPLY bot runner for LinkedIn Job: ${job_url}`);
        // For LinkedIn, we just pass directApplyUrl into the config and let the standard runner handle it
        await run_bot('linkedin', { directApplyUrl: job_url }, { headless, keep_open: !no_keep_open });
      } catch (error) {
        console.error('LinkedIn Direct Apply execution failed:', error);
        process.exit(1);
      }
    })();
  } else if (is_test_mode && bot_name === 'seek') {
    (async () => {
      try {
        const { runQuickApplyTests } = await import('./seek/tests/seek_quick_apply_test');
        await runQuickApplyTests();
      } catch (error) {
        console.error('Test execution failed:', error);
        process.exit(1);
      }
    })();
  } else if (is_quicktest_mode && bot_name === 'seek') {
    (async () => {
      try {
        const { runQuickApplyE2ETest } = await import('./seek/tests/seek_quick_apply_e2e_test');
        // await runQuickApplyE2ETest('https://www.seek.com.au/job/87057769');
        await runQuickApplyE2ETest('https://www.seek.com.au/job/87457750');
      } catch (error) {
        console.error('Quick Apply E2E test execution failed:', error);
        process.exit(1);
      }
    })();
  } else if (bot_name === 'bulk') {
    (async () => {
      try {
        const jobs_arg = args.find(a => a.startsWith('--jobs='));
        const mode_arg = args.find(a => a.startsWith('--mode='));
        const superbot_arg = args.find(a => a.startsWith('--superbot='));

        const job_ids_csv = jobs_arg ? jobs_arg.split('=')[1] : '';
        const mode = mode_arg ? mode_arg.split('=')[1] : 'review';
        const superbot = superbot_arg ? superbot_arg.split('=')[1] === 'true' : false;

        const jobIdsArray = job_ids_csv.split(',').filter(Boolean);
        if (jobIdsArray.length === 0) {
          console.error('No jobs provided to bulk orchestrator');
          process.exit(1);
        }

        await bulk_run_jobs(jobIdsArray, mode, superbot);
        process.exit(0); // Safely exit when whole queue concludes
      } catch (error) {
        console.error('Bulk orchestration failed:', error);
        process.exit(1);
      }
    })();
  } else {
    run_bot(bot_name, { maxJobsToProcess }, {
      headless,
      keep_open: !no_keep_open
    }).catch(error => {
      console.error('Bot execution failed:', error);
      process.exit(1);
    });
  }
}