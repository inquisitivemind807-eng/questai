### 1. Platform Step Function Implementation (`src/bots/seek/seek_impl.ts`)

```typescript
export async function* waitForQuickApplyPage(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    printLog("Waiting for Quick Apply page to load...");

    // Wait for page navigation and new elements to appear
    await ctx.driver.sleep(3000);

    // Check current URL to see if we're on a Quick Apply page
    const currentUrl = await ctx.driver.getCurrentUrl();
    printLog(`Current URL: ${currentUrl}`);

    // Try multiple checks with retries
    let pageReady = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      pageReady = await ctx.driver.executeScript(`
        // Check multiple indicators for Quick Apply page
        const progressBar = document.querySelector('nav[aria-label="Progress bar"]');
        const resumeSelect = document.querySelector('select[data-testid="select-input"]');
        const continueBtn = document.querySelector('button[data-testid="continue-button"]');
        const seekLogo = document.querySelector('[data-testid="seek-logo"]');
        const formElements = document.querySelectorAll('form, fieldset');

        // Check if URL contains Quick Apply indicators
        const urlHasQuickApply = window.location.href.includes('quick-apply') ||
                                 window.location.href.includes('apply') ||
                                 window.location.pathname.includes('/apply');

        const hasQuickApplyElements = !!(progressBar || resumeSelect || continueBtn);
        const hasFormElements = formElements.length > 0;
        const hasSeekBranding = !!seekLogo;

        return hasQuickApplyElements || (urlHasQuickApply && (hasFormElements || hasSeekBranding));
      `);

      if (pageReady) break;

      if (attempt < 2) {
        printLog(`Page not ready, attempt ${attempt + 1}/3, waiting...`);
        await ctx.driver.sleep(2000);
      }
    }

    if (pageReady) {
      printLog("Quick Apply page loaded successfully");
      yield "quick_apply_page_ready";
    } else {
      printLog("Quick Apply page not ready after retries");
      yield "page_load_timeout";
    }

  } catch (error) {
    printLog(`Quick Apply page load error: ${error}`);
    yield "page_load_timeout";
  }
}
```

### 2. Workflow YAML Configuration (`src/bots/seek/seek_extract_steps.yaml`)

```yaml
workflow_meta:
  title: "Seek Extract Only"
  description: "Search on seek.com.au, iterate job cards, and save job details"
  start_step: "init_context"

steps_config:
  wait_for_load:
    step: 3
    func: "waitForPageLoad"
    transitions:
      page_loaded: "detect_page_state"
      page_load_retry: "refresh_page"
      page_load_failed_permanently: "done"
    timeout: 40
    on_timeout_event: "page_load_retry"

  refresh_page:
    step: 4
    func: "refreshPage"
    transitions:
      page_refreshed: "wait_for_load"
      no_page_to_refresh: "done"
      page_reload_failed: "refresh_page" # Recursive retry
      refresh_failed_permanently: "done"
    timeout: 60
    on_timeout_event: "page_reload_failed"
    max_retries: 3
```

### 3. Step Function Registration (`src/bots/bot_starter.ts`)

```typescript
private register_bot_functions(workflow_engine: WorkflowEngine, bot_impl: any): void {
  if (typeof bot_impl === 'object') {
    Object.entries(bot_impl).forEach(([name, func]) => {
      if (typeof func === 'function') {
        // Maps the exported function name (YAML 'func') to the TS implementation
        workflow_engine.registerStepFunction(name, func as any);
      }
    });
  } else {
    throw new Error('Bot implementation must export an object with step functions');
  }
}
```

### 4. WorkflowContext Definition & Data (`src/bots/core/workflow_engine.ts`)

```typescript
export interface WorkflowContext {
  [key: string]: any;
  // Typical data found during a run:
  // driver: WebDriver | Page;       // Browser instance
  // config: any;                    // Bot configuration
  // selectors: any;                 // Platform-specific DOM selectors
  // bot_name: string;               // e.g., 'seek_apply'
  // sessionId: string;              // Unique session ID
  // jobs_extracted: number;         // Progress counter
  // current_job?: Job;              // Current job being processed
  // overlay?: UniversalOverlay;      // In-browser UI controller
}
```
