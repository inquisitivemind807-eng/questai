/**
 * Workflow Engine — YAML-Driven State Machine
 * ------------------------------------------------------------------
 * The heart of the bot orchestration system. Reads a YAML workflow
 * definition (e.g. `seek_apply_steps.yaml`) and executes it as a
 * finite state machine. Each step maps to an async generator function
 * that yields a transition event string; the engine looks up that
 * event in the step's `transitions` map to determine the next step.
 *
 * Key features:
 *   - Retry loops (max_retries + on_max_retries fallback)
 *   - Per-step timeouts via Promise.race
 *   - Browser overlay integration (UniversalOverlay)
 *   - Progress event emission via stdout [BOT_EVENT] JSON lines
 *   - Max-step guard to prevent infinite loops (default 1200)
 *
 * This file is the single most important piece of infrastructure in
 * the bot system. All bots (Seek, LinkedIn, Indeed) depend on it.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { UniversalOverlay } from './universal_overlay';
import { logger } from './logger.js';

/**
 * Single step definition read from a YAML workflow file.
 * Each step has a numbered index, a function name to call,
 * a map of yield→nextStep transitions, and optional retry/timeout config.
 */
export interface WorkflowStep {
  step: number;
  /** Name of the JS generator function to call (e.g. 'openCheckLogin') */
  func: string;
  /** Maps a yielded event string to the next step name */
  transitions: Record<string, string>;
  /** Seconds before the step times out (triggers on_timeout_event) */
  timeout: number;
  /** Event to yield when the step times out */
  on_timeout_event: string;
  /** Max consecutive retries when step transitions to itself (default 5) */
  max_retries?: number;
  /** Fallback event after exceeding max_retries (defaults to 'finish') */
  on_max_retries?: string;
}

/** Parsed YAML workflow config */
export interface WorkflowConfig {
  workflow_meta: {
    title: string;
    description: string;
    start_step: string;
  };
  steps_config: Record<string, WorkflowStep>;
}

/**
 * Mutable shared state bag passed to every step function.
 * Bots stash driver, page, overlay, config, selectors, counters,
 * and any other runtime data here. It's shaped by conventions;
 * see each bot's impl for the keys it expects.
 */
export interface WorkflowContext {
  [key: string]: any;
}

/**
 * Signature for a workflow step function.
 * Must be an async generator that yields transition event strings.
 *
 * Example:
 * ```ts
 * async function* openCheckLogin(ctx: WorkflowContext) {
 *   // ... navigate and check login ...
 *   if (loggedIn) yield 'login_not_needed';
 *   else yield 'user_needs_to_login';
 * }
 * ```
 */
export type StepFunction = (ctx: WorkflowContext) => AsyncGenerator<string, void, unknown>;

/**
 * Progress event emitted on stdout as a [BOT_EVENT] JSON line.
 * Consumed by the Tauri/Svelte frontend to update the dashboard in real time.
 */
export interface BotProgressEvent {
  type: 'step_start' | 'step_complete' | 'transition' | 'error' | 'info' | 'job_stat';
  timestamp: number;
  step?: string;
  stepNumber?: number;
  funcName?: string;
  transition?: string;
  message?: string;
  data?: any;
}

export class WorkflowEngine {
  private config: WorkflowConfig;
  private stepFunctions: Map<string, StepFunction> = new Map();
  private currentStep: string;
  private context: WorkflowContext = {};
  /** Fallback overlay created by the engine when the bot doesn't provide one */
  private overlay: UniversalOverlay | null = null;
  /** Unique session identifier, used for event correlation with the frontend */
  private botId: string;
  /** Kept for backward compat; not actively used */
  private eventsFilePath: string;
  /** Tracks consecutive self-transition retries per step (for retry loops) */
  private stepRetryCount: Map<string, number> = new Map();
  /** Set to true when the user or a signal handler requests workflow abort */
  private aborted: boolean = false;

  /**
   * Create a workflow engine from a YAML config file.
   * @param configPath - Absolute or relative path to a `*_steps.yaml` file.
   * @param botId      - Optional session ID; auto-generated if omitted.
   */
  constructor(configPath: string, botId?: string) {
    const configContent = fs.readFileSync(configPath, 'utf8');
    this.config = yaml.load(configContent) as WorkflowConfig;
    this.currentStep = this.config.workflow_meta.start_step;

    // Use provided bot ID or generate unique one
    this.botId = botId || `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    this.eventsFilePath = ''; // Not used anymore, keeping for compatibility

    // Initial event is emitted by bot_starter after context is set up.
  }

  /**
   * Emit a structured progress event on stdout for the frontend dashboard.
   * Format: `[BOT_EVENT] { type, timestamp, step, ...data, botId }`
   * Never throws — logging failures must not break the workflow.
   */
  private emitProgress(event: BotProgressEvent): void {
    try {
      const payload = { ...event, botId: this.botId };
      console.log(`[BOT_EVENT] ${JSON.stringify(payload)}`);
    } catch { /* never break workflow for logging */ }
  }

  /** Returns the unique bot session ID (used for event correlation). */
  getBotId(): string {
    return this.botId;
  }

  /**
   * Request a graceful abort. The workflow loop will exit at the next
   * step boundary. Does NOT kill the process — only sets the flag.
   */
  abort(): void {
    this.aborted = true;
    logger.info('workflow.abort', 'Abort requested by user', {}, {
      sessionId: this.context.sessionId,
      botName: this.context.bot_name
    });
  }

  /**
   * Register a named generator function so the YAML's `func` field can
   * reference it. Called by `BotStarter` after loading each platform's
   * implementation module (e.g. `linkedin_impl.ts`).
   */
  registerStepFunction(stepName: string, func: StepFunction): void {
    this.stepFunctions.set(stepName, func);
  }

  /** Set a key on the shared workflow context (accessible by all steps). */
  setContext(key: string, value: any): void {
    this.context[key] = value;
  }

  /** Read the full mutable workflow context. */
  getContext(): WorkflowContext {
    return this.context;
  }

  /**
   * Execute a single workflow step by name.
   *
   * 1. Looks up the step config (from YAML) and the generator function.
   * 2. Runs the generator with a timeout via Promise.race.
   * 3. Updates the browser overlay with progress info.
   * 4. Returns the transition event string yielded by the step.
   *
   * @throws Error if the step or function is missing from the config.
   * @throws Propagates any error thrown by the step function itself.
   */
  async executeStep(stepName: string): Promise<string> {
    const stepConfig = this.config.steps_config[stepName];
    if (!stepConfig) {
      throw new Error(`Step '${stepName}' not found in configuration`);
    }

    const stepFunction = this.stepFunctions.get(stepConfig.func);
    if (!stepFunction) {
      throw new Error(`Function '${stepConfig.func}' not registered`);
    }

    try {
      const generator = stepFunction(this.context);
      
      let result: string;
      if (typeof stepConfig.timeout === 'number' && stepConfig.timeout > 0) {
        const timeoutPromise = new Promise<string>((resolve) => {
          setTimeout(() => resolve(stepConfig.on_timeout_event), stepConfig.timeout * 1000);
        });

        result = await Promise.race([
          this.executeGenerator(generator),
          timeoutPromise
        ]);
      } else {
        result = await this.executeGenerator(generator);
      }
      logger.debug('workflow.step_result', `Step ${stepConfig.step} '${stepName}' (${stepConfig.func}) executed -> ${result}`, {
        stepName,
        stepNumber: stepConfig.step,
        func: stepConfig.func,
        result
      }, {
        sessionId: this.context.sessionId,
        botName: this.context.bot_name
      });

      this.emitProgress({
        type: 'transition',
        timestamp: Date.now(),
        step: stepName,
        stepNumber: stepConfig.step,
        funcName: stepConfig.func,
        transition: `${stepConfig.func} → ${result}`,
        data: {
          totalJobs: this.context.total_jobs || 0,
          jobsProcessed: (this.context as any).jobs_extracted || this.context.applied_jobs || 0,
          appliedJobs: this.context.applied_jobs || 0,
          skippedJobs: this.context.skipped_jobs || 0,
        }
      });

      // Use bot's overlay if available, otherwise create fallback
      const activeOverlay = this.context.overlay || this.overlay;

      // Initialize fallback overlay if no bot overlay and driver available
      if (!activeOverlay && !this.overlay && this.context.driver) {
        console.log('[DEV] Creating fallback overlay (bot should create its own)...');
        this.overlay = new UniversalOverlay(this.context.driver, 'Workflow');
        try {
          await this.overlay.showOverlay({
            title: '🤖 Bot Status: Running',
            html: `
              <div style="line-height: 1.6;">
                <p style="font-size: 20px; margin: 10px 0;"><strong>Step ${stepConfig.step}: ${stepConfig.func}</strong></p>
                <p style="color: #00ff00; font-size: 16px;">→ ${result}</p>
              </div>
            `,
            draggable: true,
            collapsible: true
          });
          console.log('[DEV] Fallback overlay visible');
        } catch (error) {
          console.warn('[DEV] Failed to initialize fallback overlay:', error);
          this.overlay = null;
        }
      }

      // Update overlay if available (prefer bot's overlay).
      // Fire-and-forget — never block workflow execution on overlay updates.
      const overlayToUpdate = this.context.overlay || this.overlay;
      if (overlayToUpdate) {
        overlayToUpdate.updateOverlay({
          title: '🤖 Bot Status: Running',
          html: `
            <div style="line-height: 1.6;">
              <p style="font-size: 20px; margin: 10px 0;"><strong>Step ${stepConfig.step}: ${stepConfig.func}</strong></p>
              <p style="color: #00ff00; font-size: 16px;">→ ${result}</p>
            </div>
          `
        }).catch(() => { });
      }

      return result;
    } catch (error) {
      console.error(`[Workflow] Error in step '${stepName}':`, error);
      logger.error('workflow.step_error', 'Workflow step execution failed', {
        stepName,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, {
        sessionId: this.context.sessionId,
        botName: this.context.bot_name
      });
      throw error;
    }
  }

  /**
   * Internal helper: await the first yield of an async generator and return its value.
   * Falls back to 'unknown' if the generator yields nothing (should never happen).
   */
  private async executeGenerator(generator: AsyncGenerator<string, void, unknown>): Promise<string> {
    const result = await generator.next();
    return result.value || 'unknown';
  }

  /**
   * Run the full workflow to completion.
   *
   * Main loop:
   *   while (currentStep !== 'done' && !aborted && stepCount < 1200)
   *     executeStep(currentStep) → event
   *     lookup transition in step config → nextStep
   *
   * On completion, updates the overlay and emits a final progress event.
   * Supports retry loops (step transitions to itself, up to max_retries).
   */
  async run(): Promise<void> {
    console.log(`[DEV] 🤖 ${this.config.workflow_meta.title}`);
    logger.info('workflow.start', 'Workflow started', {
      title: this.config.workflow_meta.title,
      description: this.config.workflow_meta.description,
      startStep: this.currentStep
    }, {
      sessionId: this.context.sessionId,
      botName: this.context.bot_name
    });


    // Initialize fallback overlay if no bot overlay and driver is available
    console.log('[DEV] Workflow context at start: driver=', !!this.context.driver, 'overlay=', !!this.context.overlay);
    if (this.context.driver && !this.context.overlay && !this.overlay) {
      console.log('[DEV] Creating fallback overlay (bot should create its own)...');
      this.overlay = new UniversalOverlay(this.context.driver, 'Workflow');
      try {
        console.log('[DEV] Showing initial overlay...');
        await this.overlay.showOverlay({
          title: '🤖 Bot Status: Starting',
          html: `
            <div style="line-height: 1.6;">
              <p style="font-size: 20px; margin: 10px 0;"><strong>Starting Workflow</strong></p>
              <p style="color: #00ff00;">${this.config.workflow_meta.description}</p>
            </div>
          `,
          draggable: true,
          collapsible: true
        });
        console.log('[DEV] Fallback overlay initialized');
      } catch (error) {
        console.warn('[DEV] Failed to initialize fallback overlay:', error);
        this.overlay = null;
      }
    } else if (this.context.overlay) {
      console.log('[DEV] Using bot-provided overlay');
    } else if (!this.context.driver) {
      // Expected for bots that initialize the browser in step0/openJobUrl.
      console.log('[DEV] Driver is not initialized yet; bot will create it in early workflow steps.');
    }

    let currentStepName = this.currentStep;
    const maxSteps = 1200; // Prevent infinite loops - limit workflow steps
    let stepCount = 0;

    while (currentStepName !== 'done' && stepCount < maxSteps && !this.aborted) {
      stepCount++;

      // Stamp current step into context so step functions (e.g. waitForNextConfirm) can read it
      this.context._currentStepName = currentStepName;
      this.context._currentStepConfig = this.config.steps_config[currentStepName];

      const event = await this.executeStep(currentStepName);
      const stepConfig = this.config.steps_config[currentStepName];

      if (stepConfig.transitions[event]) {
        let nextStepName = stepConfig.transitions[event];

        if (nextStepName === currentStepName) {
          const retries = (this.stepRetryCount.get(currentStepName) || 0) + 1;
          this.stepRetryCount.set(currentStepName, retries);
          const maxRetries = stepConfig.max_retries ?? 5;
          if (retries >= maxRetries) {
            const fallback = stepConfig.on_max_retries || 'finish';
            logger.warn('workflow.max_retries', `Step '${currentStepName}' exceeded max retries (${maxRetries}), transitioning to '${fallback}'`, {
              step: currentStepName, retries, maxRetries, fallback
            }, { sessionId: this.context.sessionId, botName: this.context.bot_name });
            this.stepRetryCount.delete(currentStepName);
            nextStepName = fallback;
          }
        } else {
          this.stepRetryCount.delete(currentStepName);
        }

        const nextStepConfig = this.config.steps_config[nextStepName];
        logger.info(
          'workflow.transition',
          `Transition: step ${stepConfig.step} '${currentStepName}' --(${event})-> step ${nextStepConfig?.step ?? '?'} '${nextStepName}'`,
          {
            fromStep: currentStepName,
            fromStepNumber: stepConfig.step,
            event,
            toStep: nextStepName,
            toStepNumber: nextStepConfig?.step
          },
          {
            sessionId: this.context.sessionId,
            botName: this.context.bot_name
          }
        );
        currentStepName = nextStepName;
      } else {
        console.warn(`❌ No transition found for event '${event}' in step '${currentStepName}'`);
        logger.warn('workflow.transition_missing', `No transition for event '${event}' in step ${stepConfig.step} '${currentStepName}'`, {
          step: currentStepName,
          stepNumber: stepConfig.step,
          event
        }, {
          sessionId: this.context.sessionId,
          botName: this.context.bot_name
        });
        break;
      }

      // Small delay between steps
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (stepCount >= maxSteps) {
      console.warn('❌ Maximum step count reached, stopping workflow');
      logger.warn('workflow.max_steps_reached', 'Maximum step count reached', {
        maxSteps,
        stepCount
      }, {
        sessionId: this.context.sessionId,
        botName: this.context.bot_name
      });
    }

    // Update overlay with completion status (prefer bot's overlay)
    const completionOverlay = this.context.overlay || this.overlay;
    if (completionOverlay) {
      try {
        await completionOverlay.updateOverlay({
          title: '🤖 Bot Status: Completed',
          html: `
            <div style="line-height: 1.6;">
              <p style="font-size: 20px; margin: 10px 0;"><strong>Workflow Completed</strong></p>
              <p style="color: #00ff00; font-size: 16px;">✅ All steps finished successfully</p>
              <p style="color: #00ffff;">Total steps: ${stepCount}</p>
              <p style="color: #ffff00; font-size: 14px;">Overlay will remain visible...</p>
            </div>
          `
        });

        // Keep the overlay visible for longer so user can see the completion
        console.log('[DEV] Workflow completed! Overlay will remain visible.');
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch {
        console.warn('[DEV] Overlay completion update skipped (window may be closed).');
      }
    }

    console.log('✅ Workflow completed');
    if (this.aborted) {
      this.emitProgress({
        type: 'info',
        timestamp: Date.now(),
        message: 'Workflow stopped by user',
        data: { aborted: true }
      });
    }

    logger.info('workflow.completed', 'Workflow completed', {
      totalSteps: stepCount
    }, {
      sessionId: this.context.sessionId,
      botName: this.context.bot_name
    });

    // Emit workflow completion event
    this.emitProgress({
      type: 'info',
      timestamp: Date.now(),
      message: 'Workflow completed successfully',
      data: { totalSteps: stepCount }
    });
  }
}