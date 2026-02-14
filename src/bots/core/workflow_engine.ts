import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { UniversalOverlay } from './universal_overlay';
import { logger } from './logger.js';

export interface WorkflowStep {
  step: number;
  func: string;
  transitions: Record<string, string>;
  timeout: number;
  on_timeout_event: string;
}

export interface WorkflowConfig {
  workflow_meta: {
    title: string;
    description: string;
    start_step: string;
  };
  steps_config: Record<string, WorkflowStep>;
}

export interface WorkflowContext {
  [key: string]: any;
}

export type StepFunction = (ctx: WorkflowContext) => AsyncGenerator<string, void, unknown>;

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
  private overlay: UniversalOverlay | null = null;
  private botId: string;
  private eventsFilePath: string;

  constructor(configPath: string) {
    const configContent = fs.readFileSync(configPath, 'utf8');
    this.config = yaml.load(configContent) as WorkflowConfig;
    this.currentStep = this.config.workflow_meta.start_step;

    // Generate unique bot ID
    this.botId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    this.eventsFilePath = ''; // Not used anymore, keeping for compatibility

    // Emit initial event
    this.emitProgress({
      type: 'info',
      timestamp: Date.now(),
      message: `Bot initialized: ${this.config.workflow_meta.title}`,
      data: { botId: this.botId }
    });
  }

  private emitProgress(event: BotProgressEvent): void {
    // Disabled - too verbose
  }

  getBotId(): string {
    return this.botId;
  }

  registerStepFunction(stepName: string, func: StepFunction): void {
    this.stepFunctions.set(stepName, func);
  }

  setContext(key: string, value: any): void {
    this.context[key] = value;
  }

  getContext(): WorkflowContext {
    return this.context;
  }

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
      const timeoutPromise = new Promise<string>((resolve) => {
        setTimeout(() => resolve(stepConfig.on_timeout_event), stepConfig.timeout * 1000);
      });

      const result = await Promise.race([
        this.executeGenerator(generator),
        timeoutPromise
      ]);
      logger.debug('workflow.step_result', 'Step executed', {
        stepName,
        stepNumber: stepConfig.step,
        func: stepConfig.func,
        result
      }, {
        sessionId: this.context.sessionId,
        botName: this.context.bot_name
      });

      // Use bot's overlay if available, otherwise create fallback
      const activeOverlay = this.context.overlay || this.overlay;

      // Initialize fallback overlay if no bot overlay and driver available
      if (!activeOverlay && !this.overlay && this.context.driver) {
        console.log('🎨 Creating fallback overlay (bot should create its own)...');
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
          console.log('✅ Fallback overlay visible');
        } catch (error) {
          console.warn('❌ Failed to initialize fallback overlay:', error);
          this.overlay = null;
        }
      }

      // Update overlay if available (prefer bot's overlay)
      const overlayToUpdate = this.context.overlay || this.overlay;
      if (overlayToUpdate) {
        try {
          await overlayToUpdate.updateOverlay({
            title: '🤖 Bot Status: Running',
            html: `
              <div style="line-height: 1.6;">
                <p style="font-size: 20px; margin: 10px 0;"><strong>Step ${stepConfig.step}: ${stepConfig.func}</strong></p>
                <p style="color: #00ff00; font-size: 16px;">→ ${result}</p>
              </div>
            `
          });

          // Small delay to keep overlay visible for each step
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          // Ignore overlay errors (e.g. window closed) so workflow continues
          console.warn('Overlay update skipped (window may be closed).');
        }
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

  private async executeGenerator(generator: AsyncGenerator<string, void, unknown>): Promise<string> {
    const result = await generator.next();
    return result.value || 'unknown';
  }

  async run(): Promise<void> {
    console.log(`🤖 ${this.config.workflow_meta.title}`);
    logger.info('workflow.start', 'Workflow started', {
      title: this.config.workflow_meta.title,
      description: this.config.workflow_meta.description,
      startStep: this.currentStep
    }, {
      sessionId: this.context.sessionId,
      botName: this.context.bot_name
    });


    // Initialize fallback overlay if no bot overlay and driver is available
    console.log('🔍 Debug: Checking for driver and overlay in context...', !!this.context.driver, !!this.context.overlay);
    if (this.context.driver && !this.context.overlay && !this.overlay) {
      console.log('🎨 Debug: Creating fallback overlay (bot should create its own)...');
      this.overlay = new UniversalOverlay(this.context.driver, 'Workflow');
      try {
        console.log('🎨 Debug: Showing initial overlay...');
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
        console.log('✅ Debug: Fallback overlay initialized');
      } catch (error) {
        console.warn('❌ Failed to initialize fallback overlay:', error);
        this.overlay = null;
      }
    } else if (this.context.overlay) {
      console.log('✅ Debug: Using bot\'s overlay');
    } else if (!this.context.driver) {
      console.log('❌ Debug: No driver found in context');
    }

    let currentStepName = this.currentStep;
    const maxSteps = 1200; // Prevent infinite loops - limit workflow steps
    let stepCount = 0;

    while (currentStepName !== 'done' && stepCount < maxSteps) {
      stepCount++;

      const event = await this.executeStep(currentStepName);
      const stepConfig = this.config.steps_config[currentStepName];

      if (stepConfig.transitions[event]) {
        logger.info('workflow.transition', 'Workflow transition', {
          fromStep: currentStepName,
          event,
          toStep: stepConfig.transitions[event]
        }, {
          sessionId: this.context.sessionId,
          botName: this.context.bot_name
        });
        currentStepName = stepConfig.transitions[event];
      } else {
        console.warn(`❌ No transition found for event '${event}' in step '${currentStepName}'`);
        logger.warn('workflow.transition_missing', 'No transition found for event', {
          step: currentStepName,
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
        console.log('✅ Workflow completed! Overlay will remain visible.');
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch {
        console.warn('Overlay completion update skipped (window may be closed).');
      }
    }

    console.log('✅ Workflow completed');
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