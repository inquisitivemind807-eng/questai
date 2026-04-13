/**
 * Shared pause-and-confirm step function.
 *
 * Used by *_pauseconfirm_steps.yaml variants to gate bot progression
 * behind a manual "Next ▶" button click in the browser overlay.
 *
 * Supports both Selenium (ctx.driver) and Playwright (ctx.page) runtimes.
 */
import type { WorkflowContext } from './workflow_engine.js';

const POLL_INTERVAL_MS = 500;

/** Execute JS in the browser regardless of Selenium vs Playwright runtime */
async function evalInBrowser(ctx: any, script: string): Promise<any> {
  if (ctx.driver?.executeScript) {
    // Selenium / WebDriver path (Seek bot)
    return ctx.driver.executeScript(script);
  }
  if (ctx.page?.evaluate) {
    // Playwright path (Indeed bot)
    return ctx.page.evaluate(new Function(script) as () => any);
  }
  throw new Error('[PauseConfirm] No browser runtime available (ctx.driver and ctx.page are both absent)');
}

/**
 * Async version of waitForNextConfirm that can be awaited directly
 * without being part of a generator workflow step.
 */
export async function waitForNextConfirmAsync(ctx: WorkflowContext, label?: string): Promise<void> {
  const stepLabel = label || 'Next Step';

  console.log(`⏸️ Pause-and-confirm: waiting for user to click Next (${stepLabel})`);

  // Show the pause-confirm overlay
  if (ctx.overlay) {
    try {
      await ctx.overlay.showPauseConfirm(stepLabel);
    } catch (e) {
      console.warn('[PauseConfirm] Could not show overlay, auto-confirming:', e);
      return;
    }
  } else {
    // No overlay at all — skip
    console.warn('[PauseConfirm] No overlay available — auto-confirming');
    return;
  }

  // Poll indefinitely for user click (no timeout — strictly manual)
  while (true) {
    try {
      const clicked = await evalInBrowser(ctx,
        `return window.__overlayPauseConfirmClicked === true ||
                sessionStorage.getItem('overlay_pause_confirm_clicked') === 'true';`
      );

      if (clicked) {
        console.log('▶️ User confirmed — resuming');
        // Reset the flag
        await evalInBrowser(ctx,
          `window.__overlayPauseConfirmClicked = false;
           sessionStorage.removeItem('overlay_pause_confirm_clicked');`
        );

        // Restore job_progress overlay so user sees normal progress between gates
        if (ctx.overlay) {
          try {
            const numerator = (ctx as any).jobs_extracted || (ctx as any).applied_jobs || 0;
            const total = (ctx as any).maxJobsLimit || (ctx as any).total_jobs || 0;
            await ctx.overlay.showJobProgress(numerator, total, 'Resuming...', 0);
          } catch { /* non-critical */ }
        }

        return;
      }
    } catch (e: any) {
      // If the browser is closed or disconnected, we must stop polling
      const msg = e?.message || "";
      if (msg.includes('closed') || msg.includes('disconnected') || msg.includes('Target page') || msg.includes('context destroyed')) {
        console.warn('[PauseConfirm] Browser session ended - aborting pause');
        return;
      }
      // Transient driver error – keep polling
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

/**
 * Workflow step function that pauses execution until the user clicks
 * "Next ▶" in the browser overlay.  Yields "confirmed" once clicked.
 */
export async function* waitForNextConfirm(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  // Derive the next step label from the YAML transition config
  const nextStepKey: string =
    (ctx as any)._currentStepConfig?.transitions?.confirmed ||
    (ctx as any)._pauseStepLabel ||
    '';

  const toLabel = (key: string) =>
    key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const stepLabel = nextStepKey ? `Next: ${toLabel(nextStepKey)}` : 'Next Step';

  await waitForNextConfirmAsync(ctx, stepLabel);
  yield 'confirmed';
}
