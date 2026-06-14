# Bot Standard — Adding a New Bot to QuestAI

This document is the canonical reference for adding a new job-platform bot
(e.g. Monster, Glassdoor, ZipRecruiter) to the QuestAI architecture.
Existing bots — Seek, LinkedIn, Jora — follow these conventions.

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
  seek/                             ← folder name = bot base name
    seek_impl.ts                    ← {bot}_impl.ts
    seek_apply_steps.yaml           ← variant YAML
    seek_extract_steps.yaml         ← variant YAML
    seek_extract_pauseconfirm_steps.yaml
    seek_apply_pauseconfirm_steps.yaml
    config/
      seek_selectors.json           ← selectors can be root or config/
  linkedin/
    linkedin_impl.ts
    linkedin_apply_steps.yaml
    linkedin_extract_steps.yaml
    linkedin_selectors.json
    linkedin_question_handler.ts    ← platform-specific handler (see §7)
  jora/
    jora_impl.ts
    jora_extract_steps.yaml         ← extract-only bot (no apply YAML)
    jora_selectors.json
```

- **Folder name**: lowercase, matches the platform (e.g. `seek`).
- **All required files** are named with the same `{bot}_` prefix.
- **YAML variants** follow the pattern `{bot}_{variant}_steps.yaml`.
- **Selectors JSON** can be at the root or in a `config/` subdirectory.
- The registry skips folders named `core`, `sessions`, `all-resumes`, `jobs`, `logs`, `data`, and anything starting with `.`.

### How the Registry Discovers Variants

Given folder `seek/` with:
```
seek_apply_steps.yaml
seek_extract_steps.yaml
```

The registry creates these bot names:
- `seek` → defaults to `seek_extract_steps.yaml` (extract has priority for the base name)
- `seek_apply` → uses `seek_apply_steps.yaml`
- `seek_extract` → uses `seek_extract_steps.yaml`

**Default YAML priority**: `{bot}_steps.yaml` > `{bot}_extract_steps.yaml` > first available.

### Known Gaps in Auto-Discovery

While the `BotRegistry` auto-discovers bot folders, several core modules have
**hardcoded platform-specific logic** that must be manually updated for every
new bot. These are enumerated in §5 below. Notably, even the existing `jora` bot
is missing from some of these modules (see `client_paths.ts` and
`sessionManager.ts`) and should be added alongside any new bot.

---

## 3. Step-by-Step: Adding a New Bot

### Step 1 — Create the bot folder

```bash
mkdir -p src/bots/yourplatform
```

Reference existing bots for structure: `seek/` is the most complete, `jora/` is the simplest.

### Step 2 — Author the selectors JSON

`src/bots/yourplatform/yourplatform_selectors.json`:

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

If your platform only supports extraction (no direct apply flow), a single extract YAML is acceptable (see `jora/`).

**YAML Schema Reference:**

```yaml
workflow_meta:
  title: "Platform Job Extraction"      # Display title
  description: "Search Platform and extract job listings"
  start_step: "start"                   # First step name in steps_config

steps_config:
  start:                                # Step name (unique key)
    step: 0                             # Display order number
    func: "step0"                       # Generator function name in {bot}_impl.ts
    transitions:                        # event → next_step_name
      extract_ready: "open_search_page"
      direct_apply_requested: "open_job_url"
      init_failed: "done"
    timeout: 30                         # Seconds before on_timeout_event fires
    on_timeout_event: "init_failed"     # Event to yield on timeout
    max_retries: 3                      # Optional: max consecutive self-transitions
    on_max_retries: "done"              # Optional: fallback after exceeding retries

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

`src/bots/yourplatform/yourplatform_impl.ts`:

```typescript
/**
 * Platform Bot Implementation
 *
 * Platform: platform.com
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

const BASE_URL = "https://www.yourplatform.com";

const printLog = (msg: string) => console.log(`[DEV] ${msg}`);
const userLog = (msg: string) => console.log(msg);  // shown on dashboard

/**
 * STEP 0: Initialize browser, session, overlay, and context.
 *
 * Must yield exactly one of these events (matching the YAML transitions):
 *   'extract_ready'          → proceed to search pipeline
 *   'direct_apply_requested' → proceed to direct-apply pipeline
 *   'init_failed'            → abort
 */
export async function* step0(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  if (!ctx.state) ctx.state = {};
  if (!ctx.driver) {
    const driver = await setupChromeDriver(
      'sessions/yourplatform',
      { headless: false },
      ['--disable-blink-features=AutomationControlled']
    );
    await StealthFeatures.applyAll(driver);
    ctx.driver = driver;
    ctx.behavior = new HumanBehavior(driver);
    ctx.overlay = new UniversalOverlay(driver, 'YourPlatform', {
      showProgress: true,
      showLogs: true,
      showPauseButton: true
    });
    await ctx.overlay.showOverlay({
      title: 'YourPlatform Bot',
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

  userLog('Starting extraction pipeline');
  yield 'extract_ready';
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
| Selenium + Chrome | Generally preferred; mature, stable | Seek, LinkedIn, Jora |

---

### Step 5 — Wire into the Bot Starter (CLI orchestrator)

Edit `src/bots/bot_starter.ts`. This file has several integration points that
control how the CLI launcher discovers, configures, and launches your bot.

#### 5a. Add a URL normalizer (if the platform uses non-canonical job URLs)

Existing normalizers live at the top of the file (e.g. `normalizeSeekJobUrl`).
If your platform's job URLs need rewriting (e.g. redirect shortening,
adding/removing query params), add a function following the Seek pattern:

```typescript
// Near line ~88, alongside existing normalizers
const normalizeYourPlatformJobUrl = (rawUrl: string): string => {
  // ... transform rawUrl into canonical form ...
  return canonicalUrl;
};
```

#### 5b. Register the apply-bot name in `bulk_run_jobs()`

In `bulk_run_jobs()` (~line 567), there is a ternary chain mapping
platform strings to their `_apply` bot variant names:

```typescript
// Add your platform to the existing ternary chain:
const applyBotName =
  platform === 'seek' ? 'seek_apply' :
  platform === 'linkedin' ? 'linkedin_apply' :
  platform === 'jora' ? 'jora' :
  platform === 'yourplatform' ? 'yourplatform_apply' :
  platform;
```

#### 5c. Register the URL normalizer in `bulk_run_jobs()`

Immediately after the apply-bot-name mapping (~line 587), there is a second
ternary that selects the URL normalizer for each platform:

```typescript
// Add your normalizer:
: platform === 'jora' && typeof job.url === 'string'
  ? job.url
: platform === 'yourplatform' && typeof job.url === 'string'
  ? normalizeYourPlatformJobUrl(job.url)
: job.url;
```

#### 5d. Add apply-mode detection in the interactive CLI

The CLI help/prompt logic (~line 659) detects apply-mode bots to ask for
a job URL:

```typescript
// Add your bot to the detection condition:
if (response.bot.includes('_apply') ||
    response.bot === 'linkedin' ||
    response.bot === 'seek' ||
    response.bot === 'yourplatform') {
  // prompt for job URL
}
```

#### 5e. Add direct-apply URL dispatch

Around line 704, the `bot_starter.ts` has special-case branching for
passing `--url` values into the workflow context for each platform:

```typescript
// Add a branch for your platform:
if (job_url && bot_name.startsWith('yourplatform')) {
  // Set ctx.config.directApplyUrl, extract job IDs, etc.
}
```

Reference existing branches for `seek` and `linkedin` as patterns.

---

### Step 6 — Wire into Core Infrastructure

The following core modules have **hardcoded platform-specific logic** and
must be manually updated for every new bot. The `BotRegistry` auto-discovers
bot folders but does **not** touch these modules.

#### 6a. Session Manager (`src/bots/core/sessionManager.ts`)

Add a new entry to the `SessionConfigs` object (~line 196) so the
`UniversalSessionManager` knows how to detect the logged-in state on
your platform:

```typescript
export const SessionConfigs = {
  seek: {
    signInSelectors: ['a[href*="login"]', 'button:has-text("Sign in")'],
    userMenuSelectors: ['[data-automation="user-menu"]'],
    loggedInIndicators: ['[data-automation="user-menu"]', '.user-name'],
    // ...
  },
  linkedin: { /* ... */ },
  yourplatform: {                              // ← ADD THIS
    signInSelectors: ['a[href*="login"]'],
    userMenuSelectors: ['.user-avatar'],
    loggedInIndicators: ['.user-avatar', '.sign-out-link'],
  },
};
```

> **Note**: `jora` is currently missing from `SessionConfigs`. If your bot
> does not require login detection, you may omit this entry, but it is
> recommended to add one for completeness.

#### 6b. Client Paths (`src/bots/core/client_paths.ts`)

The `platform` TypeScript union type is hardcoded on multiple function
signatures and needs your platform added:

```typescript
// Lines ~55, ~67, ~76, ~93 — update the union type:
platform: 'seek' | 'linkedin' | 'jora' | 'yourplatform' | 'other'
```

Also add a platform-specific legacy path directory if applicable (~line 102):

```typescript
if (platform === 'linkedin') {
    dirs.push(path.join(process.cwd(), 'jobs', 'linkedinjobs', String(jobId)));
}
// ADD:
if (platform === 'yourplatform') {
    dirs.push(path.join(process.cwd(), 'jobs', 'yourplatformjobs', String(jobId)));
}
```

> **Note**: `jora` is currently missing from this union type. Add it while
> you're editing.

#### 6c. Job Application Recorder (`src/bots/core/job_application_recorder.ts`)

**Platform union type** (~line 24, ~63):

```typescript
platform: 'seek' | 'linkedin' | 'jora' | 'yourplatform' | 'other';
```

**Candidate job directory resolution** (~line 78): add a platform-specific
path fallback:

```typescript
if (platform === 'linkedin') {
    dirs.push(path.join(process.cwd(), 'jobs', 'linkedinjobs', jobId));
} else if (platform === 'seek') {
    dirs.push(path.join(process.cwd(), 'src', 'bots', 'seek', 'jobs', jobId));
} else if (platform === 'yourplatform') {
    dirs.push(path.join(process.cwd(), 'src', 'bots', 'yourplatform', 'jobs', jobId));
}
```

**Platform validation array** (~line 305):

```typescript
if (jobData.platform && ['seek', 'linkedin', 'jora', 'other', 'yourplatform'].includes(jobData.platform))
```

**Platform detection from file path** (~line 307): add a branch to detect
your platform from directory names on disk:

```typescript
} else if (jobFilePath.includes('linkedinjobs')) {
    platform = 'linkedin';
} else if (jobFilePath.includes('jora')) {
    platform = 'jora';
} else if (jobFilePath.includes('yourplatform')) {
    platform = 'yourplatform';
} else {
    platform = 'seek';  // default
}
```

---

### Step 7 — Create the Job Tracker Route

Every bot platform gets its own job-tracker page. Create a new SvelteKit route:

**New file: `src/routes/yourplatform-job-tracker/+page.svelte`**

```svelte
<script>
  import JobTrackerBase from "$lib/components/JobTrackerBase.svelte";
</script>

<JobTrackerBase
  platform="yourplatform"
  bots={["yourplatform_extract_bot", "yourplatform_apply_bot"]}
/>
```

> For extract-only bots (like `jora`), omit the `_apply_bot` entry.

---

### Step 8 — Wire into Frontend UI Pages

#### 8a. Run Bots page (`src/routes/run-bots/+page.svelte`)

Add your bot to the `bots` array (~line 8):

```javascript
let bots = [
  { id: "linkedin_extract_bot", name: "LinkedIn Bot", image: "/finallinkedin.png" },
  { id: "seek_extract_bot",     name: "Seek Bot",     image: "/finalseek.png" },
  { id: "jora_extract_bot",     name: "Jora Bot",     image: "/finaljora.png" },
  { id: "yourplatform_extract_bot", name: "YourPlatform Bot", image: "/finalyourplatform.png" },
];
```

Add a mapping in the `runBot()` function (~line 37):

```javascript
let finalBotName = cleanBotName === "seek" ? "seek_extract" :
                   cleanBotName === "linkedin" ? "linkedin_extract" :
                   cleanBotName === "jora" ? "jora_extract" :
                   cleanBotName === "yourplatform" ? "yourplatform_extract" :
                   cleanBotName;
```

The frontend calls `invoke("run_bot_streaming", { botId, botName, extractLimit })`.
The Tauri Rust backend in `src-tauri/src/lib.rs` spawns:
```
bun src/bots/bot_starter.ts <botName>
```
No Rust-side changes are needed — the Tauri command works generically for any bot name
registered in the `BotRegistry`.

#### 8b. Navigation sidebar (`src/routes/+layout.svelte`)

Add a link to the new job tracker route in the "My Jobs" section of the
sidebar (~line 224):

```svelte
<li>
  <a href="/yourplatform-job-tracker"
     class="pl-11 {$page.url.pathname === '/yourplatform-job-tracker' ? 'active-tab' : ''}">
    YourPlatform
  </a>
</li>
```

The `<details>` open condition checks for the `-job-tracker` suffix and handles
new routes automatically — no change needed there.

#### 8c. Welcome page (`src/routes/welcome/+page.svelte`)

Add a card to the "Supported Job Platforms" section (~line 149):

```svelte
<div class="card bg-base-100 shadow-xl">
  <div class="card-body items-center p-6">
    <img src="/finalyourplatform.png" alt="YourPlatform"
         class="w-16 h-16 object-contain mb-2" />
    <span class="font-bold text-primary">YourPlatform</span>
  </div>
</div>
```

#### 8d. Control bar (`src/routes/control-bar/+page.svelte`)

Add an entry to the `providers` dropdown array (~line 11):

```javascript
const providers = [
    { value: 'seek', label: 'Seek' },
    { value: 'deknil', label: 'LinkedIn' },
    { value: 'jora', label: 'Jora' },
    { value: 'yourplatform', label: 'YourPlatform' },   // ← ADD
];
```

> Note: LinkedIn is encoded as `'deknil'` in this file; no other bot uses
> obfuscation.

---

### Step 9 — Wire into Shared UI Components

#### 9a. JobTrackerBase (`src/lib/components/JobTrackerBase.svelte`)

This is the most edit-heavy file. **Six separate locations** need your platform
added:

**1. Platform labels** (~line 55):
```javascript
const PLATFORM_LABELS = {
    linkedin: "LinkedIn",
    seek: "Seek",
    jora: "Jora",
    yourplatform: "YourPlatform",   // ← ADD
};
```

**2. Apply-bot name mapping** (~line 662): controls which bot is invoked when
the user clicks "Apply" from the job tracker:
```javascript
app.platform === "jora" ? "jora_apply" :
app.platform === "yourplatform" ? "yourplatform_apply" :   // ← ADD
app.platform;
```

**3. Platform filter dropdown — Jobs tab** (~line 985):
```svelte
<option value="yourplatform">YourPlatform</option>
```

**4. Platform badge — Jobs table rows** (~line 1147): pick a brand color
for the badge. Each existing platform uses its own brand color (e.g.
LinkedIn `#0A66C2`, Seek `#E4002B`, Jora `#00A650`):
```svelte
{:else if job.platform === 'yourplatform'}
  <span class="badge badge-sm border-none bg-[#YOUR_HEX] text-white text-[10px] h-4">
    YourPlatform
  </span>
```

**5. Platform filter dropdown — Applied Jobs tab** (~line 1413):
```svelte
<option value="yourplatform">YourPlatform</option>
```

**6. Platform badge — Application table rows** (~line 1584):
```svelte
{:else if application.platform === 'yourplatform'}
  <span class="badge badge-sm border-none bg-[#YOUR_HEX] text-white text-[10px] h-4">
    YourPlatform
  </span>
```

#### 9b. BotDashboard (`src/lib/components/BotDashboard.svelte`)

Add a branch in the job tracker URL mapping ternary (~line 62):

```javascript
$: jobsLink = platform.includes("linkedin") ? "/linkedin-job-tracker"
    : platform.includes("seek") ? "/seek-job-tracker"
    : platform.includes("jora") ? "/jora-job-tracker"
    : platform.includes("yourplatform") ? "/yourplatform-job-tracker"   // ← ADD
    : "";
```

---

### Step 10 — Add the Bot Card Image

Place your bot's card image in the `static/` directory (e.g. `static/finalyourplatform.png`).
This image is referenced by the `bots` array in `run-bots/+page.svelte` and the welcome page.

---

### Step 11 — Write tests (recommended)

Create `src/bots/yourplatform/tests/yourplatform_integration_test.ts`.
See `src/bots/seek/tests/` and `src/bots/jora/tests/` for examples.

---

### Step 12 — Verify the bot

```bash
# List all discovered bots (yours should appear)
bun src/bots/bot_starter.ts --help

# Run the extraction pipeline
bun src/bots/bot_starter.ts yourplatform_extract --headless --limit=5

# Run the apply pipeline against a specific job
bun src/bots/bot_starter.ts yourplatform_apply --url=https://platform.com/job/123
```

---

## 4. WorkflowContext: The Shared State Bag

`WorkflowContext` is `Record<string, any>` — fully dynamic. However, these
keys are established by convention across all bots:

| Key | Set by | Type | Description |
|-----|--------|------|-------------|
| `driver` | step0 | `WebDriver` | Selenium Chrome driver |
| `page` | step0 | Playwright `Page` | Playwright page (if using Playwright engine) |
| `selectors` | BotStarter | `object` | Parsed `{bot}_selectors.json` |
| `config` | BotStarter | `object` | Merged config from `src/bots/user-bots-config.json` + CLI overrides |
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

**Config note**: `ctx.config` is populated from `src/bots/user-bots-config.json`,
which holds bot-level settings (keywords, location, form data, etc.). There is
also a separate Tauri-level user config managed by the Rust backend
(`read_user_config` / `write_user_config` commands) stored in the app-data
directory — that is for global app preferences and is not part of the bot
workflow context.

---

## 5. Event Streaming Protocol

Bots communicate with the frontend exclusively through stdout. Every
progress update is a single JSON line prefixed with `[BOT_EVENT]`:

```json
[BOT_EVENT] {"type":"step_start","timestamp":1717200000000,"step":"openSearchPage","stepNumber":1,"funcName":"openSearchPage","botId":"abc123"}
```

**Event types:**

| Type | Emitted by | When | Extra fields |
|------|-----------|------|-------------|
| `step_start` | WorkflowEngine | Before a step executes | `step`, `stepNumber`, `funcName` |
| `step_complete` | Step functions | After a step completes | `step`, `transition` |
| `transition` | WorkflowEngine | Between steps | `step`, `funcName`, `transition`, `data` |
| `error` | WorkflowEngine | On any error | `message` |
| `info` | WorkflowEngine | Workflow started/completed | `message`, `data` |
| `job_stat` | Step functions | Per-job statistics | `data` |

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
| `registry` | `{ bot_registry, BotRegistry }` | Bot discovery and registration |
| `workflow_engine` | `{ WorkflowEngine, WorkflowContext }` | YAML-driven state machine runner |
| `token_manager` | `{ TokenManager }` | Token/cookie management |

---

## 7. Adding Optional Features

### AI-Powered Employer Q&A

Some job platforms have employer screening questions. There are two approaches
in the codebase:

**Seek model** (`src/bots/seek/handlers/` — 9 files):
The most complete implementation. Put handlers in a `handlers/` subdirectory:

```
yourplatform/handlers/
  answer_employer_questions.ts    # calls corpus-rag API
  extract_employer_questions.ts   # scrapes questions from DOM
  cover_letter_handler.ts         # generates cover letters
  resume_handler.ts               # resume selection/upload
  ai_provider.ts                  # AI provider abstraction
  api_fallback.ts                 # fallback API logic
  intelligent_qa_handler.ts       # intelligent Q&A routing
  generic_question_handler.ts     # generic question handling
  generic_questions_api.js        # generic questions API
```

Then add corresponding steps to your YAML and wire them in your impl.

**LinkedIn model** (`src/bots/linkedin/linkedin_question_handler.ts`):
A single flat file at the bot root. Simpler for platforms that don't need the
full multi-file handler architecture.

**Minimal approach**: If your platform has no employer Q&A, you don't need
any handlers at all. The Jora bot has an empty `handlers/` directory stub
and skips Q&A entirely.

### Cover Letter Generation

1. Create `handlers/cover_letter_handler.ts` (or a single handler file at root)
2. Add a `handleCoverLetter` step to your apply YAML
3. Call it after the "choose documents" step

### Resume Selection

1. Create `handlers/resume_handler.ts` (or a single handler file)
2. Add a `handleResumeSelection` step to your apply YAML

---

## 8. Complete Checklist for a New Bot

### New Files to Create

- [ ] `src/bots/{bot}/` folder
- [ ] `{bot}_selectors.json` — at least job card, search input, apply button selectors
- [ ] `{bot}_extract_steps.yaml` — search + extraction workflow
- [ ] `{bot}_apply_steps.yaml` — direct apply workflow (optional if platform doesn't support it)
- [ ] `{bot}_impl.ts` — all step functions as async generators
- [ ] `{bot}_extract_pauseconfirm_steps.yaml` — pause-confirm variant (optional)
- [ ] `{bot}_apply_pauseconfirm_steps.yaml` — pause-confirm variant (optional)
- [ ] `{bot}/tests/{bot}_integration_test.ts` — integration tests
- [ ] `src/routes/{bot}-job-tracker/+page.svelte` — dedicated job tracker route
- [ ] `static/final{bot}.png` — bot card image

### Existing Files to Edit — Bot Infrastructure

- [ ] `src/bots/bot_starter.ts` — URL normalizer, apply-bot mapping, URL normalizer mapping, apply-mode detection, direct-apply dispatch
- [ ] `src/bots/core/sessionManager.ts` — add `SessionConfigs` entry
- [ ] `src/bots/core/client_paths.ts` — add platform to union type + legacy path
- [ ] `src/bots/core/job_application_recorder.ts` — add platform to union type, dir fallbacks, validation array, path detection

### Existing Files to Edit — Frontend Pages

- [ ] `src/routes/run-bots/+page.svelte` — add to `bots` array + name mapping in `runBot()`
- [ ] `src/routes/+layout.svelte` — add nav sidebar link to job tracker
- [ ] `src/routes/welcome/+page.svelte` — add card to supported platforms section
- [ ] `src/routes/control-bar/+page.svelte` — add to provider dropdown

### Existing Files to Edit — Shared Components

- [ ] `src/lib/components/JobTrackerBase.svelte` — update in 6 places: platform label, apply-bot mapping, 2 filter dropdowns, 2 badge templates
- [ ] `src/lib/components/BotDashboard.svelte` — add job tracker URL mapping

### Step Implementation Checks

- [ ] `step0` initializes browser, session, overlay, and branches extract vs apply
- [ ] Each step yields events matching YAML `transitions`
- [ ] YAML ends with `"done"` terminal state
- [ ] `userLog()` calls for dashboard-visible messages

### Verification

- [ ] Bot verified via CLI: `bun src/bots/bot_starter.ts {bot}_extract`
- [ ] `bun src/bots/bot_starter.ts --help` shows the new bot name
- [ ] Bot appears on the "Choose Bot" screen (/run-bots)
- [ ] Bot appears on the Welcome page
- [ ] Bot appears in the control-bar provider dropdown
- [ ] Navigation sidebar shows the job tracker link
- [ ] Job tracker page loads and shows platform label/filter/badge
- [ ] Bot name maps correctly when launching from the frontend
- [ ] Jobs are recorded with the correct platform in the backend

---

## 9. Troubleshooting

### "Bot 'X' not found" on startup
The folder structure didn't pass registry validation. Check that all
3 required files exist and are named with the `{bot}_` prefix. Also
verify the folder is not named `core`, `sessions`, `all-resumes`,
`jobs`, `logs`, `data`, or starting with `.`.

### "Function 'step0' not registered" at runtime
The YAML's `func` field doesn't match any exported function in `{bot}_impl.ts`.
Function names are case-sensitive. The registry registers every exported
function of type `'function'` from the module.

### "No transition found for event 'X'"
Your step function yielded an event string that doesn't appear as a key
in that step's `transitions` map in the YAML. Add it or fix the yield.

### Frontend doesn't show my bot
Check that:
1. The bot card is in the `bots` array in `src/routes/run-bots/+page.svelte`
2. The bot name mapping in `runBot()` maps to the correct variant name
3. The bot is registered (verify with `--help` from CLI)

### Bot not visible in navigation sidebar
The sidebar links in `src/routes/+layout.svelte` are manually maintained.
Ensure you added a new `<li><a>` entry in the "My Jobs" section.

### Overlay not appearing
Ensure your `step0` creates the `UniversalOverlay` and calls
`overlay.showOverlay()` before yielding.

### Login detection not working
Check two things:
1. Your `SessionConfigs` entry in `src/bots/core/sessionManager.ts` has
   correct CSS selectors for your platform's logged-in indicators
2. Your platform is supported by the session manager (it uses the
   hardcoded `SessionConfigs` object, not auto-discovery)

### Jobs not recording with correct platform name
Check `src/bots/core/job_application_recorder.ts`:
1. Your platform is in the TypeScript union type on the function signatures
2. Your platform is in the validation array that checks `jobData.platform`
3. Your platform has a branch in the path-based detection chain

### TypeScript errors about missing platform in union types
`src/bots/core/client_paths.ts` and `src/bots/core/job_application_recorder.ts`
both use hardcoded platform union types. Add your platform to every occurrence.

### Selectors break after platform UI changes
Selectors are plain JSON arrays. You can layer multiple fallback
selectors per element. Check the page manually and update
`{bot}_selectors.json`. No code changes needed.

---

## Appendix A: Existing Bots Reference

| Bot | Location | Engine | Q&A Handlers | Notes |
|-----|----------|--------|-------------|-------|
| **Seek** | `src/bots/seek/` | Selenium | `handlers/` (9 files) | Most complete; extract + apply + Q&A + cover letter + resume |
| **LinkedIn** | `src/bots/linkedin/` | Selenium | `linkedin_question_handler.ts` (flat file) | extract + apply + Q&A |
| **Jora** | `src/bots/jora/` | Selenium | None (empty stub) | extract only; simplest bot |

## Appendix B: Quick-Reference Edit Map

When adding a new bot named `{bot}`, edit these files in this order:

| Order | File | What to do |
|-------|------|------------|
| 1 | `src/bots/{bot}/` (new dir) | Create all bot implementation files |
| 2 | `src/routes/{bot}-job-tracker/+page.svelte` (new) | Create job tracker route |
| 3 | `static/final{bot}.png` (new) | Add bot card image |
| 4 | `src/bots/core/sessionManager.ts` | Add `SessionConfigs` entry |
| 5 | `src/bots/core/client_paths.ts` | Add to platform union type and dir fallback |
| 6 | `src/bots/core/job_application_recorder.ts` | Add to union type, validation array, detection chain, dir resolution |
| 7 | `src/bots/bot_starter.ts` | Add URL normalizer, apply-bot mapping, normalizer mapping, apply-mode detection, direct-apply dispatch |
| 8 | `src/routes/run-bots/+page.svelte` | Add to `bots` array and `runBot()` mapping |
| 9 | `src/routes/+layout.svelte` | Add sidebar nav link |
| 10 | `src/routes/welcome/+page.svelte` | Add platform card |
| 11 | `src/routes/control-bar/+page.svelte` | Add provider dropdown entry |
| 12 | `src/lib/components/JobTrackerBase.svelte` | Update 6 locations (label, mapping, 2 filters, 2 badges) |
| 13 | `src/lib/components/BotDashboard.svelte` | Add job tracker URL mapping |

> **Note**: While adding your bot, also add `jora` to `client_paths.ts` and
> `sessionManager.ts` if missing — these are known gaps in the codebase.
