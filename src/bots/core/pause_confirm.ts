/**
 * Shared pause-and-confirm step function.
 *
 * Used by *_pauseconfirm_steps.yaml variants to gate bot progression
 * behind a manual "Next ▶" button click in the browser overlay.
 */
import type { WorkflowContext } from './workflow_engine.js';

const POLL_INTERVAL_MS = 500;
const MAX_WAIT_MS = 5 * 60 * 1000; // 5 minutes safety timeout

/**
 * Workflow step function that pauses execution until the user clicks
 * "Next ▶" in the browser overlay.  Yields "confirmed" once clicked
 * (or after the safety timeout expires).
 */
export async function* waitForNextConfirm(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  // Derive the next step label from the YAML transition config
  const nextStepKey: string =
    ctx._currentStepConfig?.transitions?.confirmed ||
    ctx._pauseStepLabel ||
    '';

  const toLabel = (key: string) =>
    key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const stepLabel = nextStepKey ? `Next: ${toLabel(nextStepKey)}` : 'Next Step';

  console.log(`⏸️ Pause-and-confirm: waiting for user to click Next (${stepLabel})`);

  // Show the pause-confirm overlay
  if (ctx.overlay) {
    try {
      await ctx.overlay.showPauseConfirm(stepLabel);
    } catch (e) {
      console.warn('[PauseConfirm] Could not show overlay, auto-confirming:', e);
      yield 'confirmed';
      return;
    }
  } else if (ctx.driver) {
    // Fallback: if no overlay object, just sleep briefly
    console.warn('[PauseConfirm] No overlay available — auto-confirming after 2s');
    await ctx.driver.sleep(2000);
    yield 'confirmed';
    return;
  } else {
    // No driver at all — skip
    yield 'confirmed';
    return;
  }

  // Poll for user click
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    try {
      const clicked = await ctx.driver.executeScript(`
        return window.__overlayPauseConfirmClicked === true ||
               sessionStorage.getItem('overlay_pause_confirm_clicked') === 'true';
      `);

      if (clicked) {
        console.log('▶️ User confirmed — resuming workflow');
        // Reset the flag
        await ctx.driver.executeScript(`
          window.__overlayPauseConfirmClicked = false;
          sessionStorage.removeItem('overlay_pause_confirm_clicked');
        `);

        // Restore job_progress overlay so user sees normal progress between gates
        if (ctx.overlay) {
          try {
            const numerator = ctx.jobs_extracted || ctx.applied_jobs || 0;
            const total = ctx.maxJobsLimit || ctx.total_jobs || 0;
            await ctx.overlay.showJobProgress(numerator, total, 'Resuming...', 0);
          } catch { /* non-critical */ }
        }

        yield 'confirmed';
        return;
      }
    } catch {
      // Transient driver error – keep polling
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  // Safety timeout
  console.log('⏰ Pause-confirm timeout (5 min) — auto-confirming');
  try {
    await ctx.driver.executeScript(`
      window.__overlayPauseConfirmClicked = false;
      sessionStorage.removeItem('overlay_pause_confirm_clicked');
    `);
  } catch { /* ignore */ }

  yield 'confirmed';
}
