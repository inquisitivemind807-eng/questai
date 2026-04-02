# Bot Development Standards

This document defines the mandatory standards that ALL bots in this system must follow. These standards ensure consistency, maintainability, and compatibility with the bot runner infrastructure.

---

## 1. Directory Structure

Every bot MUST follow this structure:

```
src/bots/{bot_name}/
├── {bot_name}_impl.ts       # Main implementation (REQUIRED)
├── {bot_name}_steps.yaml     # Workflow definition (REQUIRED)
├── config/
│   ├── {bot_name}_selectors.json  # DOM selectors
│   └── {bot_name}_config.json     # Bot-specific config (optional)
├── handlers/                 # Specialized handlers (optional)
│   ├── resume_handler.ts
│   ├── cover_letter_handler.ts
│   └── ...
├── tests/                    # Test files (optional)
│   └── {bot_name}_test.ts
└── README.md                 # Bot documentation (recommended)
```

---

## 2. Bot Implementation File Structure

### 2.1 Required Imports

```typescript
import { WebDriver, By, until, Key } from 'selenium-webdriver';
import { setupChromeDriver } from '../core/browser_manager';
import { HumanBehavior, StealthFeatures, DEFAULT_HUMANIZATION } from '../core/humanization';
import { UniversalSessionManager, SessionConfigs } from '../core/sessionManager';
import { UniversalOverlay } from '../core/universal_overlay';
import type { WorkflowContext } from '../core/workflow_engine';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
```

### 2.2 Required Setup

```typescript
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const printLog = (message: string) => {
  console.log(message);
};
```

---

## 3. Mandatory Functions

Every bot MUST implement these core functions in order:

### 3.1 **step0** - Context Initialization (REQUIRED)

**Purpose:** Load configuration, selectors, and initialize context variables

**Function Signature:**
```typescript
export async function* step0(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  // Load selectors
  const selectors = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'config/{bot_name}_selectors.json'), 'utf8')
  );

  // Load config
  const config = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../core/user-bots-config.json'), 'utf8')
  );

  // Set context
  ctx.selectors = selectors;
  ctx.config = config;

  // Bot-specific initialization
  // ...

  printLog("Context initialized");
  yield "ctx_ready";
}
```

**Requirements:**
- MUST be named `step0` or use a descriptive name like `initContext`
- MUST load selectors from config file
- MUST load user config
- MUST set `ctx.selectors` and `ctx.config`
- MUST yield success event (e.g., "ctx_ready")

---

### 3.2 **Browser Setup** - Chrome Driver Initialization (REQUIRED)

**Purpose:** Initialize browser with session management, humanization, and stealth features

**Function Signature:**
```typescript
export async function* openHomepage(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    // Setup Chrome driver with session
    const { driver, sessionExists, sessionsDir } = await setupChromeDriver('{bot_name}');

    // Store in context
    ctx.driver = driver;
    ctx.sessionExists = sessionExists;
    ctx.sessionsDir = sessionsDir;

    // Initialize humanization and session manager
    ctx.humanBehavior = new HumanBehavior(DEFAULT_HUMANIZATION);
    ctx.sessionManager = new UniversalSessionManager(driver, SessionConfigs.{bot_name});
    ctx.overlay = new UniversalOverlay(driver, 'BotName');

    // Apply stealth features
    await StealthFeatures.hideWebDriver(driver);
    await StealthFeatures.randomizeUserAgent(driver);

    // Navigate to starting URL
    printLog(`Opening URL: ${STARTING_URL}`);
    await driver.get(STARTING_URL);
    await driver.sleep(3000);

    const currentUrl = await driver.getCurrentUrl();
    printLog(`Current URL: ${currentUrl}`);

    yield "homepage_opened";
  } catch (error) {
    printLog(`Browser setup failed: ${error}`);
    yield "browser_setup_failed";
  }
}
```

**Requirements:**
- MUST use `setupChromeDriver(bot_name)`
- MUST initialize `ctx.driver`, `ctx.humanBehavior`, `ctx.sessionManager`, `ctx.overlay`
- MUST apply stealth features (`hideWebDriver`, `randomizeUserAgent`)
- MUST handle errors and yield appropriate events
- MUST log navigation actions

---

## 4. Function Signature Standards

### 4.1 All Step Functions MUST:

```typescript
export async function* functionName(
  ctx: WorkflowContext
): AsyncGenerator<string, void, unknown> {
  // Implementation
  yield "event_name";
}
```

**Requirements:**
- Use `async function*` (async generator)
- Accept exactly ONE parameter: `ctx: WorkflowContext`
- Return type: `AsyncGenerator<string, void, unknown>`
- MUST be exported
- MUST yield string event names for workflow transitions

---

### 4.2 Context (ctx) Usage

The `WorkflowContext` is the ONLY way to share state between steps.

**Common Context Properties:**
```typescript
// Browser
ctx.driver: WebDriver
ctx.humanBehavior: HumanBehavior
ctx.sessionManager: UniversalSessionManager
ctx.overlay: UniversalOverlay

// Configuration
ctx.config: any
ctx.selectors: any

// Session info
ctx.sessionExists: boolean
ctx.sessionsDir: string

// Job tracking
ctx.job_cards: WebElement[]
ctx.job_index: number
ctx.total_jobs: number
ctx.applied_jobs: number
ctx.skipped_jobs: number
ctx.current_job: any

// Bot-specific data
// Add custom properties as needed
```

**Rules:**
- ALWAYS read/write shared state through `ctx`
- NEVER use global variables
- NEVER modify context properties from other bots

---

## 5. Event Yielding Standards

### 5.1 Event Naming Convention

```typescript
// Success events
yield "step_completed"
yield "data_loaded"
yield "button_clicked"

// Error events
yield "step_failed"
yield "element_not_found"
yield "validation_error"

// Retry events
yield "retry_step"
yield "page_reload_required"
```

**Rules:**
- Use snake_case for event names
- Use descriptive, action-oriented names
- Success events: `{action}_{past_tense}` (e.g., "page_loaded")
- Error events: `{action}_failed` or `{resource}_not_found`
- Events MUST match transitions defined in YAML

---

## 6. Logging Standards

### 6.1 Use `printLog` Function

```typescript
const printLog = (message: string) => {
  console.log(message);
};
```

### 6.2 Logging Requirements

```typescript
// Log at function entry
printLog("Step 5: Collecting job cards");

// Log important actions
printLog(`Found ${cards.length} job cards`);

// Log errors
printLog(`Error clicking button: ${error}`);

// Log progress
printLog(`Processing job ${index + 1}/${total}`);
```

**Rules:**
- Use emojis sparingly (only for key milestones)
- Include context (counts, URLs, etc.)
- Log all errors with error details
- Log user-facing actions

---

## 7. Error Handling Standards

### 7.1 Try-Catch Pattern

```typescript
export async function* someStep(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    // Main logic here
    printLog("Performing action...");

    // Risky operation
    const result = await ctx.driver.findElement(By.css('.selector'));

    printLog("Action completed successfully");
    yield "action_completed";

  } catch (error) {
    printLog(`Action failed: ${error}`);
    yield "action_failed";
  }
}
```

**Rules:**
- ALWAYS wrap risky operations in try-catch
- Log errors with context
- Yield appropriate error events
- Allow workflow engine to handle retries (don't retry in step functions)

---

## 8. Overlay Standards (REQUIRED)

### 8.1 Overlay Initialization

The overlay MUST be initialized during browser setup with the bot name:

```typescript
export async function* openHomepage(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const { driver, sessionExists, sessionsDir } = await setupChromeDriver('mybot');

  // ... other setup ...

  // REQUIRED: Initialize overlay with bot name
  ctx.overlay = new UniversalOverlay(driver, 'MyBot');
}
```

**Requirements:**
- MUST initialize `ctx.overlay = new UniversalOverlay(driver, 'BotName')` in browser setup function
- MUST pass bot name as second parameter (e.g., 'Seek', 'LinkedIn')
- MUST import `UniversalOverlay` from `'../core/universal_overlay'`
- Overlay will automatically persist across page navigations
- Overlay initializes lazily on first use (fast startup)

---

### 8.2 Overlay Persistence & Navigation Handling

**The overlay automatically persists across ALL page navigations.** This includes:

- User manual navigation (clicking links)
- JavaScript navigation (window.location, history API)
- Form submissions
- Redirects
- Quick Apply popups/new tabs

**How it works:**

1. **SessionStorage State**: Overlay state is saved to `sessionStorage`, which persists across same-tab navigations
2. **Navigation Detection**: MutationObserver and History API hooks detect page changes
3. **Auto-Reinjection**: Overlay is automatically recreated with saved state after navigation
4. **Position Memory**: User's drag position is preserved
5. **Collapse State**: Collapsed/expanded state is remembered

**You don't need to do anything** - the overlay will automatically reappear on every page with the last state.

**Example flow:**
```
1. Bot shows job progress overlay
2. User navigates to sign-in page → Overlay persists
3. User signs in and returns → Overlay still there
4. Bot opens Quick Apply tab → Overlay appears in new tab
5. User drags overlay to corner → Position saved
```

---

### 8.3 Sign-In Overlay

Use when user needs to manually log in:

```typescript
export async function* showManualLoginPrompt(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    await ctx.overlay.showSignInOverlay();
    printLog("Manual login prompt shown");
    yield "prompt_displayed";
  } catch (error) {
    printLog(`Error showing login prompt: ${error}`);
    yield "prompt_failed";
  }
}
```

**API:**
```typescript
await ctx.overlay.showSignInOverlay(): Promise<void>
```

**When to use:**
- Credentials missing or invalid
- Manual authentication required
- Session expired and auto-login failed

---

### 8.4 Job Progress Overlay

Track and display job application progress to the user:

#### Initial Progress Display

```typescript
export async function* openJobsPage(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  // Initialize overlay with starting progress
  await ctx.overlay.showJobProgress(0, 0, "Initializing bot...", 5);

  yield "jobs_page_loaded";
}
```

#### Update Progress

```typescript
export async function* applyToJob(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const appliedCount = (ctx.applied_jobs || 0) + 1;
  ctx.applied_jobs = appliedCount;

  // Update overlay with current progress
  await ctx.overlay.updateJobProgress(
    appliedCount,           // Applied count
    ctx.total_jobs || 0,    // Total count
    "Job applied successfully", // Status message
    currentStepNumber       // Current step number
  );

  yield "job_applied";
}
```

**API:**
```typescript
// Initialize job progress overlay
await ctx.overlay.showJobProgress(
  appliedCount: number,
  totalCount: number,
  message: string,
  stepNumber: number
): Promise<void>

// Update existing progress overlay
await ctx.overlay.updateJobProgress(
  appliedCount: number,
  totalCount: number,
  message: string,
  stepNumber: number
): Promise<void>
```

**Requirements:**
- MUST call `showJobProgress` when job processing starts
- MUST call `updateJobProgress` after each job processed
- MUST track `ctx.applied_jobs` and `ctx.total_jobs`
- Status message should be user-friendly and descriptive

---

### 8.5 Overlay Best Practices

```typescript
// Example: Complete job processing flow with overlay

export async function* extractJobDetails(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const jobs = await findJobs();

  ctx.total_jobs = jobs.length;
  ctx.applied_jobs = 0;

  // Initialize progress
  await ctx.overlay.showJobProgress(0, jobs.length, "Jobs extracted", 10);

  yield "jobs_extracted";
}

export async function* applyToJob(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    // Apply to job
    await submitApplication();

    // Update counters
    ctx.applied_jobs = (ctx.applied_jobs || 0) + 1;

    // Update overlay
    await ctx.overlay.updateJobProgress(
      ctx.applied_jobs,
      ctx.total_jobs || 0,
      `Applied: ${ctx.current_job?.title}`,
      14
    );

    yield "job_applied";
  } catch (error) {
    // Update overlay even on failure
    ctx.skipped_jobs = (ctx.skipped_jobs || 0) + 1;

    await ctx.overlay.updateJobProgress(
      ctx.applied_jobs || 0,
      ctx.total_jobs || 0,
      "Application failed",
      14
    );

    yield "application_failed";
  }
}

export async function* finish(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  // Final overlay update
  if (ctx.overlay) {
    await ctx.overlay.updateJobProgress(
      ctx.applied_jobs || 0,
      ctx.total_jobs || 0,
      "Workflow completed!",
      99
    );
  }

  printLog(`Workflow complete: Applied ${ctx.applied_jobs}, Skipped ${ctx.skipped_jobs}`);
  yield "done";
}
```

**Overlay Update Guidelines:**
- Update after EVERY job processed (success or failure)
- Use descriptive messages ("Applied: Software Engineer at Google")
- Check if overlay exists before calling (`if (ctx.overlay)`)
- Always update in finish/cleanup steps
- Keep step numbers sequential (helps with debugging)

---

### 8.6 Common Overlay Patterns

#### Pattern 1: Login Flow
```typescript
// Show sign-in overlay when credentials missing
if (!username || !password) {
  await ctx.overlay.showSignInOverlay();
  yield "manual_login_required";
}
```

#### Pattern 2: Job Extraction
```typescript
// Initialize progress when jobs are found
const jobs = await extractJobs();
ctx.total_jobs = jobs.length;
await ctx.overlay.showJobProgress(0, jobs.length, "Jobs found", stepNum);
```

#### Pattern 3: Job Application
```typescript
// Update after each application
ctx.applied_jobs++;
await ctx.overlay.updateJobProgress(
  ctx.applied_jobs,
  ctx.total_jobs,
  `Applied: ${jobTitle}`,
  stepNum
);
```

#### Pattern 4: Skip Job
```typescript
// Update when skipping jobs
ctx.skipped_jobs++;
await ctx.overlay.updateJobProgress(
  ctx.applied_jobs || 0,
  ctx.total_jobs || 0,
  "External apply (skipped)",
  stepNum
);
```

---

## 9. Export Pattern (REQUIRED)

### 9.1 Export All Step Functions

At the END of your implementation file:

```typescript
export const {botName}StepFunctions = {
  step0,
  openHomepage,
  waitForPageLoad,
  detectPageState,
  performSearch,
  collectJobCards,
  clickJobCard,
  // ... all other step functions
};
```

**Requirements:**
- Export object MUST be named `{botName}StepFunctions` (camelCase)
- Include ALL step functions used in YAML
- Export at bottom of file
- Use object shorthand syntax

---

## 9. YAML Workflow Standards

### 9.1 Required YAML Structure

```yaml
workflow_meta:
  title: "Bot Name"
  description: "Brief description of what the bot does"
  start_step: "init_context"

steps_config:
  init_context:
    step: 0
    func: "step0"
    transitions:
      ctx_ready: "open_homepage"
      ctx_failed: "init_context"  # Retry on failure
    timeout: 30
    on_timeout_event: "ctx_failed"

  open_homepage:
    step: 1
    func: "openHomepage"
    transitions:
      homepage_opened: "detect_page_state"
      browser_setup_failed: "open_homepage"
    timeout: 30
    on_timeout_event: "browser_setup_failed"

  # ... more steps
```

**Requirements:**
- MUST define `workflow_meta` with `title`, `description`, `start_step`
- Each step MUST have: `step` (number), `func` (function name), `transitions`, `timeout`
- ALL events yielded in code MUST be defined in `transitions`
- MUST define `on_timeout_event` for timeout handling
- Use sequential step numbering (0, 1, 2, 2.5, 3, etc.)

---

## 10. Selector Configuration Standards

### 10.1 Selectors JSON Structure

```json
{
  "urls": {
    "home_url": "https://example.com",
    "jobs_url": "https://example.com/jobs",
    "login_url": "https://example.com/login"
  },
  "auth": {
    "username_input_id": "username",
    "password_input_id": "password",
    "signin_button_xpath": "//button[@type='submit']"
  },
  "jobs": {
    "job_card_selector": "article.job-card",
    "title_selector": "h2.title",
    "apply_button_candidates": [
      "button[data-test='apply']",
      "button:contains('Apply')"
    ]
  }
}
```

**Rules:**
- Group selectors by feature (`urls`, `auth`, `jobs`, etc.)
- Provide multiple candidates for fragile selectors (use arrays)
- Use descriptive keys
- Include URLs as selectors

---

## 11. Session Management Standards

### 11.1 SessionConfigs Registration

Your bot MUST be registered in `SessionConfigs`:

```typescript
// In src/bots/core/sessionManager.ts
export const SessionConfigs = {
  seek: {
    baseUrl: "https://www.seek.com.au",
    urlPatterns: [/seek\.com\.au/],
    sessionDomain: "seek.com.au"
  },
  linkedin: {
    baseUrl: "https://www.linkedin.com",
    urlPatterns: [/linkedin\.com/],
    sessionDomain: "linkedin.com"
  },
  // ADD YOUR BOT HERE
  yourbot: {
    baseUrl: "https://yourbot.com",
    urlPatterns: [/yourbot\.com/],
    sessionDomain: "yourbot.com"
  }
};
```

---

## 12. Common Patterns

### 12.1 Element Selection with Fallbacks

```typescript
const selectors = ['primary-selector', 'fallback-1', 'fallback-2'];

for (const selector of selectors) {
  try {
    const element = await ctx.driver.findElement(By.css(selector));
    if (await element.isDisplayed()) {
      await element.click();
      yield "element_clicked";
      return;
    }
  } catch {
    continue;
  }
}

yield "element_not_found";
```

### 12.2 Page State Detection

```typescript
const pageSource = await ctx.driver.getPageSource();
const isLoggedIn = !pageSource.includes('Sign in');

yield isLoggedIn ? "logged_in" : "sign_in_required";
```

### 12.3 Progress Tracking

```typescript
if (ctx.overlay && ctx.total_jobs) {
  ctx.applied_jobs = (ctx.applied_jobs || 0) + 1;
  await ctx.overlay.updateJobProgress(
    ctx.applied_jobs,
    ctx.total_jobs,
    "Job applied successfully",
    currentStepNumber
  );
}
```

---

## 13. Testing Standards

### 13.1 Test File Structure

```typescript
// {bot_name}_test.ts
import { BotStarter } from '../bot_starter';

export async function runBotTests() {
  const bot_starter = new BotStarter();

  try {
    await bot_starter.run_bot({
      bot_name: '{bot_name}',
      config: {
        // Test config
      },
      headless: true,
      keep_open: false
    });

    console.log("✅ Test passed");
  } catch (error) {
    console.error("❌ Test failed:", error);
    throw error;
  }
}
```

---

## 14. Documentation Standards

### 14.1 README.md Requirements

Each bot MUST have a README with:
- Bot purpose and functionality
- Required configuration (API keys, credentials, etc.)
- Workflow overview (steps)
- Known limitations
- Example usage

---

## 15. Checklist for New Bots

Before submitting a new bot, ensure:

- [ ] Directory structure follows standards
- [ ] `step0` function initializes context
- [ ] Browser setup function includes humanization
- [ ] All functions use `async function*` with `ctx: WorkflowContext`
- [ ] All functions yield event names
- [ ] YAML defines all transitions
- [ ] Step functions exported in `{botName}StepFunctions` object
- [ ] Selectors organized in JSON file
- [ ] Session config registered in `SessionConfigs`
- [ ] Error handling with try-catch
- [ ] Logging with `printLog`
- [ ] README.md documentation
- [ ] Tests written (optional but recommended)

---

## Example: Minimal Bot Template

```typescript
import { WebDriver, By } from 'selenium-webdriver';
import { setupChromeDriver } from '../core/browser_manager';
import { HumanBehavior, StealthFeatures, DEFAULT_HUMANIZATION } from '../core/humanization';
import { UniversalSessionManager, SessionConfigs } from '../core/sessionManager';
import type { WorkflowContext } from '../core/workflow_engine';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const printLog = (message: string) => {
  console.log(message);
};

// Step 0: Initialize Context
export async function* step0(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const selectors = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/mybot_selectors.json'), 'utf8'));
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../core/user-bots-config.json'), 'utf8'));

  ctx.selectors = selectors;
  ctx.config = config;

  printLog("Context initialized");
  yield "ctx_ready";
}

// Step 1: Open Homepage
export async function* openHomepage(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    const { driver, sessionExists, sessionsDir } = await setupChromeDriver('mybot');
    ctx.driver = driver;
    ctx.sessionExists = sessionExists;
    ctx.sessionsDir = sessionsDir;
    ctx.humanBehavior = new HumanBehavior(DEFAULT_HUMANIZATION);
    ctx.sessionManager = new UniversalSessionManager(driver, SessionConfigs.mybot);
    ctx.overlay = new UniversalOverlay(driver, 'MyBot');

    await StealthFeatures.hideWebDriver(driver);
    await StealthFeatures.randomizeUserAgent(driver);

    await driver.get('https://mybot.com');
    await driver.sleep(3000);

    printLog("Homepage opened");
    yield "homepage_opened";
  } catch (error) {
    printLog(`Error: ${error}`);
    yield "homepage_failed";
  }
}

// Export step functions
export const mybotStepFunctions = {
  step0,
  openHomepage,
  // ... more functions
};
```

---

**This document is the source of truth for bot development. All bots MUST comply with these standards.**
