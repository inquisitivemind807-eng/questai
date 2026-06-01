# Bot Standard — Adding a New Bot to QuestAI

This document is the canonical reference for adding a new job-platform bot
(e.g. Monster, Glassdoor, ZipRecruiter) to the QuestAI architecture.

After reading this you will understand every file, convention, and pattern
that makes a bot discoverable, executable, and UI-visible.

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│  Frontend (Svelte + Tauri)                               │
│  /run-bots  → invoke("run_bot_streaming")                │
│  /bot-logs  ← listens for [BOT_EVENT] lines from stdout  │
└───────────────────────┬──────────────────────────────────┘
                        │ Tauri command spawns:
                        │ bun src/bots/bot_starter.ts <bot_name>
                        ▼
┌──────────────────────────────────────────────────────────┐
│  bot_starter.ts  (Orchestrator)                          │
│  • Loads .env / CLI args                                 │
│  • Calls BotRegistry.discover_bots()                     │
│  • dynamic import of {bot}_impl.ts                       │
│  • Creates WorkflowEngine with YAML                      │
│  • Registers step functions → runs workflow              │
└───────────────────────┬──────────────────────────────────┘
                        ▼
┌──────────────────────────────────────────────────────────┐
│  WorkflowEngine  (YAML State Machine)                    │
│  while step != 'done':                                   │
│    executeStep(step) → event string                      │
│    lookup transitions[event] → next step                 │
│  Emits [BOT_EVENT] progress lines on stdout              │
└───────────────────────┬──────────────────────────────────┘
                        ▼
┌──────────────────────────────────────────────────────────┐
│  {bot}_impl.ts  (Step Functions)                         │
│  async function* stepName(ctx) { ... yield "event"; }    │
│  Uses: browser_manager, humanization, overlay,           │
│        api_client, pause_confirm, etc.                   │
└──────────────────────────────────────────────────────────┘
```

**Key principle**: Bots are YAML-driven state machines whose steps are
implemented as async generator functions. The `BotRegistry` auto-discovers
bots by scanning folders for a 3-file contract.

---

## 2. The 3-Artifact Contract

For a folder under `src/bots/` to be registered as a valid bot, it **must**
contain these three files:

| # | File | Purpose |
|---|------|---------|
| 1 | `{bot}_impl.ts` | Async generator step functions |
| 2 | `*_steps.yaml` | Workflow state-machine definition |
| 3 | `{bot}_selectors.json` | CSS/XPath DOM selectors for the platform |

### Naming Conventions

```
src/bots/
  monster/                       ← folder name = bot base name
    monster_impl.ts              ← {bot}_impl.ts
    monster_apply_steps.yaml     ← variant YAML
    monster_extract_steps.yaml   ← variant YAML
    monster_selectors.json       ← {bot}_selectors.json
```

- **Folder name**: lowercase, matches the platform (e.g. `monster`).
- **All required files** are named with the same `{bot}_` prefix.
- **YAML variants** follow the pattern `{bot}_{variant}_steps.yaml`.
- **Selectors JSON** can be at the root or in a `config/` subdirectory.
- The registry skips folders named `core`, `sessions`, `data`, `logs`, `all-resumes`, and anything starting with `.`.

### How the Registry Discovers Variants

Given folder `monster/` with:
```
monster_apply_steps.yaml
monster_extract_steps.yaml
```

The registry creates these bot names:
- `monster` → defaults to `monster_extract_steps.yaml` (extract has priority for the base name)
- `monster_apply` → uses `monster_apply_steps.yaml`
- `monster_extract` → uses `monster_extract_steps.yaml`

**Default YAML priority**: `{bot}_steps.yaml` > `{bot}_extract_steps.yaml` > first available.

---

## 3. Step-by-Step: Adding a New Bot

### Step 1 — Create the bot folder

```bash
mkdir -p src/bots/monster
```

### Step 2 — Author the selectors JSON

`src/bots/monster/monster_selectors.json`:

```jsonc
{
  "search_input":        ["input[name=\"q\"]", "#search-box"],
  "location_input":      ["input[name=\"where\"]"],
  "search_button":       ["button[type=\"submit\"]"],
  "job_cards":           ["div.job-card", "article.job-result"],
  "job_title":           ["h2.title a", "[data-testid=\"job-title\"]"],
  "job_company":         ["span.company"],
  "job_location":        ["span.location"],
  "apply_button":        ["button.apply-now", "a[data-automation=\"apply\"]"],
  "easy_apply_modal":    ["div.modal-apply"],
  "submit_button":       ["button[type=\"submit\"]"]
}
```

Every value is an **array of CSS selectors** in priority order. The bot should
try them sequentially and use the first one that resolves.

### Step 3 — Write the workflow YAML(s)

Create at minimum one YAML workflow. The standard pattern is two variants:
- `{bot}_extract_steps.yaml` — search & extract job listings
- `{bot}_apply_steps.yaml` — apply to a specific job URL

**YAML Schema Reference:**

```yaml
workflow_meta:
  title: "Monster Job Extraction"      # Display title
  description: "Search Monster and extract job listings"
  start_step: "start"                  # First step name in steps_config

steps_config:
  start:                               # Step name (unique key)
    step: 0                            # Display order number
    func: "step0"                      # Generator function name in {bot}_impl.ts
    transitions:                       # event → next_step_name
      extract_ready: "open_search_page"
      direct_apply_requested: "open_job_url"
      init_failed: "done"
    timeout: 30                        # Seconds before on_timeout_event fires
    on_timeout_event: "init_failed"    # Event to yield on timeout
    max_retries: 3                     # Optional: max consecutive self-transitions
    on_max_retries: "done"             # Optional: fallback after exceeding retries

  open_search_page:
    step: 1
    func: "openSearchPage"
    transitions:
      page_ready: "enter_search_terms"
      navigation_failed: "done"
    timeout: 60
    on_timeout_event: "navigation_failed"

  # ... more steps ...

  finish:
    step: 99
    func: "finish"
    transitions: {}
    timeout: 5
    on_timeout_event: "done"
```

**Field reference:**

| Field | Required | Description |
|-------|----------|-------------|
| `step` | Yes | Display order number (float OK, e.g. `0.5`) |
| `func` | Yes | Name of async generator function in `{bot}_impl.ts` |
| `transitions` | Yes | Map of `yielded_event: next_step_name` |
| `timeout` | Yes | Seconds; step aborts and yields `on_timeout_event` after this |
| `on_timeout_event` | Yes | Event yielded when timeout fires |
| `max_retries` | No | Max consecutive times this step can transition to itself (default 5) |
| `on_max_retries` | No | Fallback event after exceeding `max_retries` (default `'finish'`) |

**Special transition values:**
- `"done"` — ends the workflow loop

**Pause-confirm variants**: If you want a manual-review mode, create
`{bot}_extract_pauseconfirm_steps.yaml` and
`{bot}_apply_pauseconfirm_steps.yaml`. These insert a `waitForNextConfirm`
step between every action step so the user must approve each transition.

### Step 4 — Implement the step functions

`src/bots/monster/monster_impl.ts`:

```typescript
/**
 * Monster Bot Implementation
 *
 * Platform: monster.com
 * Browser engine: Selenium + Chrome (or Playwright + Chromium)
 */

import { WebDriver, By, until } from 'selenium-webdriver';
import { setupChromeDriver } from '../core/browser_manager';
import { HumanBehavior, StealthFeatures } from '../core/humanization';
import { UniversalOverlay } from '../core/universal_overlay';
import { UniversalSessionManager } from '../core/sessionManager';
import type { WorkflowContext } from '../core/workflow_engine';
import { waitForNextConfirm } from '../core/pause_confirm';
import { apiRequest } from '../core/api_client';
import { recordJobApplicationToBackend } from '../core/job_application_recorder';
import { highlightElement } from '../core/highlight';
import * as path from 'path';
import * as fs from 'fs';

const BASE_URL = "https://www.monster.com";

const printLog = (msg: string) => console.log(`[DEV] ${msg}`);
const userLog = (msg: string) => console.log(msg);  // shown on dashboard

/**
 * STEP 0: Initialize browser, session, overlay, and context.
 *
 * Must yield exactly one of these events (matching the YAML transitions):
 *   'extract_ready'         → proceed to search pipeline
 *   'direct_apply_requested' → proceed to direct-apply pipeline
 *   'init_failed'           → abort
 */
export async function* step0(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  if (!ctx.state) ctx.state = {};
  if (!ctx.driver) {
    const driver = await setupChromeDriver(
      'sessions/monster',
      { headless: false },
      ['--disable-blink-features=AutomationControlled']
    );
    await StealthFeatures.applyAll(driver);
    ctx.driver = driver;
    ctx.behavior = new HumanBehavior(driver);
    ctx.overlay = new UniversalOverlay(driver, 'Monster', {
      showProgress: true,
      showLogs: true,
      showPauseButton: true
    });
    await ctx.overlay.showOverlay({
      title: 'Monster Bot',
      html: '<p>Initializing...</p>',
      draggable: true,
      collapsible: true
    });
    ctx.driver.getSession();  // verify driver is alive
  }

  // Branch based on whether a direct URL was provided
  if (ctx.config?.directApplyUrl) {
    userLog('Direct apply URL detected, entering apply pipeline');
    yield 'direct_apply_requested';
    return;
  }

  userLog('Starting Monster extraction pipeline');
  yield 'extract_ready';
}

/**
 * STEP 1: Navigate to search page and wait for it to load.
 */
export async function* openSearchPage(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const driver: WebDriver = ctx.driver;
  const selectors = ctx.selectors;

  await driver.get(`${BASE_URL}/jobs/search`);
  await ctx.behavior?.randomDelay(500, 1500);

  try {
    // Wait for any known element to confirm page load
    await driver.wait(until.elementLocated(By.css(selectors.search_input[0])), 15000);
    userLog('Monster search page loaded');
    yield 'page_ready';
  } catch {
    userLog('Failed to load Monster search page');
    yield 'navigation_failed';
  }
}

/**
 * STEP 2: Enter search keywords and location.
 */
export async function* enterSearchTerms(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const driver: WebDriver = ctx.driver;
  const selectors = ctx.selectors;
  const config = ctx.config;

  const keywords = config?.formData?.keywords || 'software engineer';
  const location = config?.formData?.locations || '';

  try {
    // Type keywords
    const keywordInput = await driver.findElement(By.css(selectors.search_input[0]));
    await highlightElement(driver, keywordInput);
    await ctx.behavior?.humanType(keywordInput, keywords);

    // Type location if provided
    if (location && selectors.location_input) {
      const locInput = await driver.findElement(By.css(selectors.location_input[0]));
      await ctx.behavior?.humanType(locInput, location);
    }

    // Click search
    const searchBtn = await driver.findElement(By.css(selectors.search_button[0]));
    await ctx.behavior?.humanClick(searchBtn);

    userLog(`Searching Monster for "${keywords}"`);
    yield 'search_submitted';
  } catch (err) {
    userLog(`Search entry failed: ${err}`);
    yield 'search_failed';
  }
}

// ... continue implementing all steps referenced in your YAML ...
```

**Step function contract:**

```typescript
// Every step function MUST have this exact signature:
async function* stepName(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  // ... do work ...

  // MUST yield exactly one event string before returning
  yield 'transition_event_name';
  // (event must match a key in the YAML step's `transitions` map)
}

// ctx is a mutable shared bag. Common keys (set by convention):
//   ctx.driver     — Selenium WebDriver instance
//   ctx.page       — Playwright Page (if using Playwright)
//   ctx.selectors  — loaded from {bot}_selectors.json
//   ctx.config     — merged bot config + user overrides
//   ctx.overlay    — UniversalOverlay instance
//   ctx.behavior   — HumanBehavior instance
//   ctx.state      — arbitrary mutable state across steps
//   ctx.sessionId  — unique session identifier
//   ctx.bot_name   — name of the running bot variant
```

**Critical rules for step functions:**

1. Every function **must** `yield` exactly one event string before returning.
2. The yielded string **must** match a key in that step's `transitions` map.
3. Never call `return` without yielding first (the engine awaits `generator.next()`).
4. All side effects (page nav, typing, clicking) must be inside the try/catch
   of a single step — the engine will re-invoke the generator on retry.
5. Use `userLog()` for dashboard-visible messages; use `printLog()` for debug-only.

**Browser engine choice:**

| Engine | When to use | Example |
|--------|-------------|---------|
| Selenium + Chrome | Generally preferred; mature, stable | Seek, LinkedIn |
| Playwright + Chromium | Site has Cloudflare challenges that block Selenium | Indeed |

If using Playwright, wrap `page` in `PlaywrightDriverAdapter` so the `UniversalOverlay` works.
See `indeed_impl.ts:58-83` for the adapter class.

### Step 5 — Add to the frontend

Edit `src/routes/run-bots/+page.svelte`. Add your bot to the `bots` array:

```javascript
let bots = [
  { id: "linkedin_extract_bot", name: "LinkedIn Bot", image: "/finallinkedin.png" },
  { id: "seek_extract_bot",     name: "Seek Bot",     image: "/finalseek.png" },
  { id: "indeed",               name: "Indeed Bot",   image: "/finalindeed.png" },
  { id: "monster_extract_bot",  name: "Monster Bot",  image: "/finalmonster.png" },  // ← ADD
];
```

Then add a mapping in the `runBot()` function (around line 35):

```javascript
let finalBotName = cleanBotName === "seek" ? "seek_extract" :
                   cleanBotName === "linkedin" ? "linkedin_extract" :
                   cleanBotName === "monster" ? "monster_extract" :    // ← ADD
                   cleanBotName;
```

The frontend calls `invoke("run_bot_streaming", { botId, botName, extractLimit })`.
The Tauri Rust backend in `src-tauri/src/lib.rs` spawns:
```
bun src/bots/bot_starter.ts <botName>
```
No Rust-side changes are needed — the Tauri command works generically for any bot name
registered in the `BotRegistry`.

### Step 6 — Write tests (recommended)

Create `src/bots/monster/tests/monster_integration_test.ts`:

```typescript
/**
 * Monster Bot — Integration Test
 *
 * Run: bun src/bots/monster/tests/monster_integration_test.ts
 */

import { setupChromeDriver } from '../../core/browser_manager';
import { HumanBehavior, StealthFeatures } from '../../core/humanization';
import { By, until } from 'selenium-webdriver';
import * as fs from 'fs';
import * as path from 'path';

async function testMonsterSearch() {
  const selectorsPath = path.join(__dirname, '../monster_selectors.json');
  const selectors = JSON.parse(fs.readFileSync(selectorsPath, 'utf8'));

  const driver = await setupChromeDriver('sessions/monster_test', { headless: false });
  const behavior = new HumanBehavior(driver);

  try {
    await driver.get('https://www.monster.com/jobs/search');
    await driver.wait(until.elementLocated(By.css(selectors.search_input[0])), 15000);

    const keywordInput = await driver.findElement(By.css(selectors.search_input[0]));
    await behavior.humanType(keywordInput, 'software engineer');

    const searchBtn = await driver.findElement(By.css(selectors.search_button[0]));
    await behavior.humanClick(searchBtn);

    await driver.sleep(3000);

    const cards = await driver.findElements(By.css(selectors.job_cards[0]));
    console.log(`Found ${cards.length} job cards`);

    if (cards.length === 0) {
      throw new Error('No job cards found — selectors may be broken');
    }

    console.log('Monster search test PASSED');
  } finally {
    await driver.quit();
  }
}

testMonsterSearch().catch(err => {
  console.error('Test FAILED:', err);
  process.exit(1);
});
```

### Step 7 — Verify the bot

```bash
# List all discovered bots (yours should appear)
bun src/bots/bot_starter.ts --help

# Run the extraction pipeline
bun src/bots/bot_starter.ts monster_extract --headless --limit=5

# Run the apply pipeline against a specific job
bun src/bots/bot_starter.ts monster_apply --url=https://monster.com/job/123 --mode=review
```

---

## 4. WorkflowContext: The Shared State Bag

`WorkflowContext` is `Record<string, any>` — fully dynamic. However, these
keys are established by convention across all bots:

| Key | Set by | Type | Description |
|-----|--------|------|-------------|
| `driver` | step0 | `WebDriver` | Selenium Chrome driver |
| `page` | step0 | Playwright `Page` | Playwright page (Indeed-style bots) |
| `selectors` | BotStarter | `object` | Parsed `{bot}_selectors.json` |
| `config` | BotStarter | `object` | Merged config from `user-bots-config.json` + overrides |
| `overlay` | step0 | `UniversalOverlay` | Browser-injected status panel |
| `behavior` | step0 | `HumanBehavior` | Human-like typing/clicking delays |
| `state` | step0 | `object` | Arbitrary mutable state across steps |
| `sessionId` | BotStarter | `string` | Unique session identifier for logging |
| `bot_name` | BotStarter | `string` | Running bot variant name |
| `extract_limit` | BotStarter | `number` | Max jobs to extract |
| `jobs_extracted` | step functions | `number` | Count of extracted jobs |
| `applied_jobs` | step functions | `number` | Count of applied jobs |
| `skipped_jobs` | step functions | `number` | Count of skipped jobs |
| `total_jobs` | step functions | `number` | Total jobs in current search |
| `_currentStepName` | WorkflowEngine | `string` | Current executing step name |
| `_currentStepConfig` | WorkflowEngine | `WorkflowStep` | Current step's YAML config |

---

## 5. Event Streaming Protocol

Bots communicate with the frontend exclusively through stdout. Every
progress update is a single JSON line prefixed with `[BOT_EVENT]`:

```json
[BOT_EVENT] {"type":"step_start","timestamp":1717200000000,"step":"openSearchPage","stepNumber":1,"funcName":"openSearchPage","botId":"abc123"}
```

**Event types:**

| Type | When | Extra fields |
|------|------|-------------|
| `step_start` | Before a step executes | `step`, `stepNumber`, `funcName` |
| `step_complete` | After a step completes | `step`, `transition` |
| `transition` | Between steps | `step`, `funcName`, `transition`, `data` |
| `error` | On any error | `message` |
| `info` | Workflow started/completed | `message`, `data` |
| `job_stat` | Per-job statistics | `data` |

Call `userLog()` in your step functions — it writes to stdout and is
automatically captured as a log entry in the frontend dashboard.

---

## 6. Shared Core Utilities

All of these are available in `src/bots/core/` and can be imported by any bot:

| Module | Import | What it does |
|--------|--------|-------------|
| `browser_manager` | `{ setupChromeDriver, killAllChromeProcesses }` | Launch Chrome with Selenium, session persistence, stealth |
| `humanization` | `{ HumanBehavior, StealthFeatures, DEFAULT_HUMANIZATION }` | Human-like delays, typing, scrolling, anti-detection |
| `universal_overlay` | `{ UniversalOverlay }` | Browser-injected floating UI panel |
| `sessionManager` | `{ UniversalSessionManager, SessionConfigs }` | Cross-platform login detection |
| `pause_confirm` | `{ waitForNextConfirm }` | Pause workflow until user clicks "Next" |
| `api_client` | `{ apiRequest }` | Authenticated HTTP client for corpus-rag backend |
| `logger` | `{ logger }` | Structured JSONL logger |
| `config_loader` | `{ loadUserConfig }` | Safe config file loader |
| `client_paths` | `{ getJobArtifactDir, getClientEmailFromContext }` | Per-client artifact path resolver |
| `job_application_recorder` | `{ recordJobApplicationToBackend }` | POST job applications to backend |
| `highlight` | `{ highlightElement, highlightSelector }` | Visual element highlighting in browser |

---

## 7. Adding Optional Features

### AI-Powered Employer Q&A

Most job platforms have employer screening questions. Seek uses a full
AI Q&A pipeline. To add this to your bot:

1. Create `handlers/answer_employer_questions.ts` that calls the corpus-rag API
2. Create `handlers/extract_employer_questions.ts` that scrapes questions from the DOM
3. Add `extractEmployerQuestions` and `handleEmployerQuestions` steps to your YAML
4. Import and wire them in your step functions

### Cover Letter Generation

1. Create `handlers/cover_letter_handler.ts`
2. Add a `handleCoverLetter` step to your apply YAML
3. Call it after the "choose documents" step

### Resume Selection

1. Create `handlers/resume_handler.ts`
2. Add a `handleResumeSelection` step to your apply YAML

---

## 8. Checklist for a New Bot

- [ ] Folder created under `src/bots/` with correct name
- [ ] `{bot}_selectors.json` — at least job card, search input, apply button selectors
- [ ] `{bot}_extract_steps.yaml` — search + extraction workflow
- [ ] `{bot}_apply_steps.yaml` — direct apply workflow
- [ ] `{bot}_impl.ts` — all step functions as async generators
- [ ] `step0` initializes browser, session, overlay, and branches extract vs apply
- [ ] Each step yields events matching YAML `transitions`
- [ ] YAML ends with `"done"` terminal state
- [ ] `userLog()` calls for dashboard-visible messages
- [ ] Bot added to `/run-bots/+page.svelte` bots array
- [ ] Bot card image placed in `static/` directory
- [ ] Integration test written
- [ ] Bot verified via CLI: `bun src/bots/bot_starter.ts <bot_name>`
- [ ] `bun src/bots/bot_starter.ts --help` shows the new bot name
- [ ] Pause-confirm variants created (optional but recommended)

---

## 9. Troubleshooting

### "Bot 'monster' not found" on startup
The folder structure didn't pass registry validation. Check that all
3 required files exist and are named with the `{bot}_` prefix.

### "Function 'step0' not registered" at runtime
The YAML's `func` field doesn't match any exported function in `{bot}_impl.ts`.
Function names are case-sensitive. The registry registers every exported
function of type `'function'` from the module.

### "No transition found for event 'X'"
Your step function yielded an event string that doesn't appear as a key
in that step's `transitions` map in the YAML. Add it or fix the yield.

### Frontend doesn't show my bot
Check that:
1. The bot card is in the `bots` array in `/run-bots/+page.svelte`
2. The bot name mapping in `runBot()` maps to the correct variant name
3. The bot is registered (verify with `--help` from CLI)

### Overlay not appearing
Ensure your `step0` creates the `UniversalOverlay` and calls
`overlay.showOverlay()` before yielding. For Playwright bots, use
`PlaywrightDriverAdapter` to bridge the Selenium API.

### Login detection not working
Configure `sessionManager` with CSS selectors that indicate logged-in
state on your platform (e.g., user avatar, "Sign Out" link).

### Selectors break after platform UI changes
Selectors are plain JSON arrays. You can layer multiple fallback
selectors per element. Check the page manually and update
`{bot}_selectors.json`. No code changes needed.
