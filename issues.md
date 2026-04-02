# QuestAI: Issues Investigation Report

## Group 1: Easily Fixable UI Issues Only

### Issue #11: Bot Log Dashboard: Panel Close Button

**Files Involved:**
- `src/lib/components/BotDashboard.svelte` — UI for the bot panel
- `src/lib/stores/botProgressStore.ts` — state management for bots

**Exact Lines:**
- `src/lib/components/BotDashboard.svelte` lines 88–116: The card header section — currently has a Stop button (lines 104–115) but no close/dismiss button for completed/failed bots.
- `src/lib/stores/botProgressStore.ts` lines 108–222: The store's returned methods — `startBot`, `stopBot`, `addLogLine`, `addProgressEvent`, `reset`, `handleBotStopped`. There is no `removeBot(botId)` method.

**Root Cause:**
The `botProgressStore` only supports adding bots (`startBot`, `addLogLine`, `addProgressEvent`) or resetting the entire list (`reset()`). There is no mechanism to remove a single bot entry from the `bots` Record, and consequently, no UI button to trigger such a dismissal. The `handleBotStopped` method (line 197) marks bots as completed/failed/stopped but never removes them from the store.

**Side Effects & Dependencies:**
Adding a `removeBot` method to `botProgressStore` will affect the derived `allBots` (line 231) and `activeBots` (line 227) stores, since they derive from the same `bots` Record.

**Original Intent vs. Breakdown:**
The system was built to track all bots within a session, but failed to account for a user's desire to "clear" completed or failed bot panels from their view.

**Fix Plan:**
1. `src/lib/stores/botProgressStore.ts`: Add a `removeBot(botId: string)` method after `handleBotStopped` (after line 221):
   ```typescript
   removeBot(botId: string) {
     update(state => {
       delete state.bots[botId];
       return { ...state };
     });
   },
   ```
2. `src/lib/components/BotDashboard.svelte`: Add a new prop `export let onDismiss = () => {};` and add a dismiss button in the header section (near line 104). Show it only when `displayStatus` is `'completed'`, `'failed'`, or `'stopped'`:
   ```svelte
   {#if displayStatus === 'completed' || displayStatus === 'failed' || displayStatus === 'stopped'}
     <button class="btn btn-ghost btn-sm" on:click={onDismiss} title="Dismiss">✕</button>
   {/if}
   ```
3. In the parent component that renders `<BotDashboard>`, pass `onDismiss={() => botProgressStore.removeBot(botId)}`.
4. Complexity: Low-Medium. Store method + UI button + wiring in parent.

---

### Issue #15: Job Analytics: UI Cleanup

**Files Involved:**
- `src/lib/components/JobTrackerBase.svelte` — common table component for jobs

**Exact Lines:**
- `src/lib/components/JobTrackerBase.svelte` lines 1133–1146: Badges for `jobType` and `workMode` rendered inline in the "Job Details" column of scraped jobs.
- `src/lib/components/JobTrackerBase.svelte` lines 1161–1175: The "Type" column renders `job.applicationType` (internal/external) — this column exists and works, but LinkedIn jobs often lack this field.
- `src/lib/components/JobTrackerBase.svelte` lines 662–668: `deleteSelectedJobs()` — uses `if (!confirm(...)) return;` (a standard browser `confirm()` popup for deletion).

**Root Cause:**
The table renderer injects `jobType` and `workMode` badges (lines 1133–1146) into the "Job Details" column as inline badges below the company name. For the "Type" column (lines 1161–1175), it shows `applicationType` (internal/external). On LinkedIn, `applicationType` is often missing, so the column shows "—". The deletion logic on line 662 uses `confirm()` which is a blocking browser popup.

**Side Effects & Dependencies:**
Modifying the table columns affects layout across LinkedIn, Seek, and Indeed trackers since they all share `JobTrackerBase`.

**Original Intent vs. Breakdown:**
Intended to show as much info as possible at a glance, but resulted in a cluttered and inconsistent UI across different platforms.

**Fix Plan:**
1. Lines 1133–1146: Move `jobType` and `workMode` badges OUT of the Job Details column into the "Type" column (lines 1161–1175) or into a dedicated new column. Alternatively, remove these badges entirely if they clutter the UI.
2. Lines 1161–1175: Merge `job.jobType` into this column so it shows both application type AND job type. Example: show `jobType` if `applicationType` is missing.
3. Lines 662–668: Replace `confirm()` with a DaisyUI modal confirmation dialog for a consistent look:
   - Add a `showDeleteConfirm` state variable.
   - Show a `<dialog class="modal">` with confirm/cancel buttons.
   - On confirm, call the actual delete logic.
4. Complexity: Medium. Requires reshuffling table column content and adding a modal.

---

### Issue #16: Onboarding: Resume Builder Redirect

**Files Involved:**
- `src/lib/components/JobTrackerBase.svelte` — handles the "Bot Apply" and "Bulk Apply" actions

**Exact Lines:**
- `src/lib/components/JobTrackerBase.svelte` lines 625–628: `triggerBotApply` function checks `if (!selectedResumeFile)` and shows `alert("Please select a resume first from Auto-Apply modal.");`
- `src/lib/components/JobTrackerBase.svelte` lines 767–769: `bulkApply` function checks `if (selectedJobs.length === 0)` and shows `alert("Please select at least one job first.");`

**Root Cause:**
The application currently uses `alert()` to notify users when a resume is missing before an application. It does not redirect the user to the Resume Builder page at `/resume-builder`.

**Side Effects & Dependencies:**
`goto` from `$app/navigation` is already imported on line 7 — no new import needed.

**Original Intent vs. Breakdown:**
The alerts were quick placeholders. The user wants a proactive redirect or a more contextual UI flow.

**Fix Plan:**
1. Lines 625–628: Replace the `alert(...)` with:
   ```javascript
   if (confirm("No resume selected. Would you like to go to the Resume Builder?")) {
     goto('/resume-builder');
   }
   return;
   ```
   Or use a DaisyUI modal for consistency.
2. Lines 767–769: Keep as-is (just a job selection check) or convert `alert` to a toast.
3. Complexity: Low. Simple redirect logic.




## Group 2: Others (Logic, Scrapers, Auth, Backend)

### Issue #2: Payment Redirect: Session Loss

**Files Involved:**
- `src/lib/authService.js` — manages authentication lifecycle

**Exact Lines:**
- `src/lib/authService.js` lines 296–303: `if (rememberMe === 'false') { await deleteCache(...); set({ ... }); return; }` (Wipes ALL tokens on initialization if rememberMe is 'false')

**Root Cause:**
When returning from an external origin (e.g. Stripe payment sandbox), the Svelte app re-initializes — `+layout.svelte` calls `authService.initialize()` (line 19). The `initialize()` function (line 289) reads the `rememberMe` flag from cache (line 292). If the value is `'false'`, it aggressively wipes all tokens from disk cache (lines 297–301) including the access and refresh tokens. This prevents session continuity during redirects if the user didn't check "Remember Me".

The fundamental issue: the code cannot distinguish between "a fresh app cold start" (where wiping makes sense for non-remembered sessions) and "a redirect back from an external payment page" (where session should survive).

**Side Effects & Dependencies:**
Directly impacts any flow that leaves and returns to the app origin (payments, OAuth callbacks, etc.).

**Original Intent vs. Breakdown:**
Intended to simulate `sessionStorage` by not persisting tokens for guest users across app restarts. Breakdown occurs because it uses file-based cache (which persists across page loads in Tauri) but treats `rememberMe === 'false'` as "always wipe on init".

**Fix Plan:**
⚠️ COMPLEXITY: Medium-High. This is architecturally tangled.
1. Option A (Quick fix): Change the `rememberMe === 'false'` check to also look for a "payment redirect in progress" flag. Before redirecting to payment, set `sessionStorage.setItem('payment_redirect_in_progress', 'true')`. In `initialize()`, if that flag is present, skip the wipe, clear the flag, and continue.
2. Option B (Better fix): Replace the `rememberMe === 'false'` wipe-on-init with a "wipe-on-explicit-logout" pattern + a "wipe-after-tab-close" pattern. Store a `sessionStorage` heartbeat flag. On init, if `rememberMe === 'false'` AND the heartbeat is missing AND there's no payment redirect flag, then wipe. This properly distinguishes cold starts from in-session navigations.
3. The key file is `src/lib/authService.js` lines 289–328 (`initialize` function).
4. Whichever option is chosen, also add an `onBeforeUnload` or `visibilitychange` listener to set/clear the heartbeat.

---

### Issue #5: LinkedIn Bot: Viewport Sensitivity

**Files Involved:**
- `src/bots/core/browser_manager.ts` — handles Selenium driver setup
- `src/bots/linkedin/linkedin_impl.ts` — LinkedIn bot implementation

**Exact Lines:**
- `src/bots/core/browser_manager.ts` lines 487–503: First tries `driver.manage().window().maximize()` (line 488). Falls back to `setRect({ width: 1920, height: 1080, x: 0, y: 0 })` (line 496). If both fail, continues anyway with whatever size the OS gives (line 501–502).

**Root Cause:**
In environments where `maximize()` or 1920x1080 resizing fails (e.g., Wayland with Sway, small screens, certain Linux WMs), LinkedIn's responsive CSS activates. This hides the job details side-panel or changes element locations. The LinkedIn scraper relies on desktop-specific CSS selectors that are not present or functional in these smaller viewports. The Wayland-specific flags are on lines 369–380 but they address rendering, not sizing.

**Side Effects & Dependencies:**
Causes selective failure of bot steps on different OS/hardware configurations. The `extractJobDetailsFromPanel` function (linkedin_impl.ts line 1517) is especially sensitive since it looks for a details panel that only appears in wide viewports.

**Original Intent vs. Breakdown:**
The fallback chain (maximize → setRect → continue anyway) aims for maximum compatibility but silently degrades. No logging indicates the actual final window size, making debugging hard.

**Fix Plan:**
1. `src/bots/core/browser_manager.ts` after line 503 (the final catch): Add a size verification step that logs actual window dimensions:
   ```typescript
   const rect = await driver.manage().window().getRect();
   printLog(`📐 Final window size: ${rect.width}x${rect.height}`);
   if (rect.width < 1200) {
     printLog(`⚠️ WARNING: Window width ${rect.width}px is below 1200px. LinkedIn desktop layout may not render correctly.`);
   }
   ```
2. In `src/bots/linkedin/linkedin_impl.ts`, add a viewport-width guard before selector-intensive steps like `extractJobDetailsFromPanel` (line 1517). If width < 1200, attempt a `setRect` resize or log an actionable error.
3. Complexity: Medium. The core issue is OS/WM constraints that may be unresolvable — the fix is mostly about detection and graceful degradation.

### Issue #10: Data Storage: Origin of Data

**Files Involved:**
- `src/lib/file-manager.ts` — local file management via Tauri
- `src/routes/frontend-form/+page.svelte` — configuration and upload logic

**Exact Lines:**
- `src/lib/file-manager.ts` lines 58–71: `registerManagedFile` — Tauri `invoke` call to `register_managed_file` (local storage)
- `src/lib/file-manager.ts` lines 73–86: `registerManagedBinaryFile` — Tauri `invoke` call to `register_managed_file_base64` (local binary storage)
- `src/routes/frontend-form/+page.svelte` line 143: `fetch('${CORPUS_RAG_API}/api/extract-document', ...)` — sends resume to cloud API for AI extraction

**Root Cause:**
The app uses a hybrid model. File artifacts (resumes, cover letters) are stored locally on the user's machine via Tauri filesystem commands (`file-manager.ts`). Heavy AI processing (like resume text extraction) is offloaded to the `corpus-rag` cloud API (line 143 in `frontend-form/+page.svelte`). This is primarily an informational/architectural observation, not a bug.

**Side Effects & Dependencies:**
Requires users to have local write permissions for artifact storage while maintaining an internet connection for AI tasks.

**Fix Plan:**
No fix needed — this is an architectural observation. If the user wants to change this:
1. To go fully local: Replace the `fetch` to `/api/extract-document` with a local PDF/DOCX parser (e.g., `pdf-parse` or `mammoth`).
2. To go fully cloud: Replace Tauri file management with cloud storage API calls.
3. Complexity: N/A (informational issue).

---

### Issue #13: Filter Logic: Seek & LinkedIn

**Files Involved:**
- `src/bots/seek/seek_impl.ts` — Seek bot logic
- `src/bots/linkedin/linkedin_impl.ts` — LinkedIn bot logic

**Exact Lines:**
- `src/bots/seek/seek_impl.ts` line 769: `export async function* applySeekFilters(ctx: WorkflowContext)` (Seek filter implementation)
- `src/bots/linkedin/linkedin_impl.ts` line 656: `export async function* applyFilters(ctx: WorkflowContext)` (LinkedIn filter implementation)

**Root Cause:**
Both filter implementations are generator functions that rely on complex, platform-specific DOM manipulation. They attempt to open "All Filters" modals and inject JavaScript/Selenium clicks to set preferences (salary, job type, location). These are highly brittle because they depend on transient CSS classes and button labels that change frequently during platform A/B testing. Both functions are wrapped in try/catch — on failure, they yield a success string anyway and continue without filters (Seek yielding a no-op, LinkedIn logging the error and proceeding).

**Side Effects & Dependencies:**
Failures in these steps cause the entire "Search" phase to return unfiltered results — more jobs than expected, many not matching preferences. This increases processing time and wasted applications.

**Fix Plan:**
⚠️ COMPLEXITY: High. These are the most fragile parts of the codebase.
1. Short-term: Add fallback URL-parameter-based filtering. Both Seek and LinkedIn support URL query parameters for filters (e.g., `?salaryRange=80000-&jobType=full-time`). Pre-build the search URL with filters embedded so DOM manipulation is only needed for filters that can't be expressed via URL.
2. Medium-term: Add a "filter verification" step after `applySeekFilters`/`applyFilters` — parse the result page URL or check filter pill badges to verify filters actually applied. If not, log a warning.
3. Long-term: Consider moving filter configuration to user-facing config and encoding them into the initial search URL rather than DOM-clicking.
4. Files: `src/bots/seek/seek_impl.ts` line 769+, `src/bots/linkedin/linkedin_impl.ts` line 656+.

---

### Issue #19: LinkedIn Bot: Extraction Hang

**Files Involved:**
- `src/bots/linkedin/linkedin_impl.ts` — LinkedIn step functions

**Exact Lines:**
- `src/bots/linkedin/linkedin_impl.ts` line 1517: `export async function* extractJobDetailsFromPanel(ctx: WorkflowContext)` — the extraction entry point
- `src/bots/linkedin/linkedin_impl.ts` line 1558: `await waitForLinkedInPanelSync(driver, selectors, currentJob, 3000)` — waits for panel to sync with a 3-second timeout
- `src/bots/linkedin/linkedin_impl.ts` line 116: `async function waitForLinkedInPanelSync(...)` — the sync helper function definition

**Root Cause:**
The extraction CAN hang if:
1. `waitForLinkedInPanelSync` (line 116) is called with a timeout (3000ms on line 1558, larger values elsewhere like 1203), but subsequent `driver.findElement` calls for metadata have no explicit timeout — they fall back to Selenium's implicit wait, which can block indefinitely if elements never appear.
2. There is no comprehensive try/catch/timeout block around the *entire* extraction sequence that would yield a failure step to the workflow engine.
3. `waitForLinkedInPanelSync` itself uses a polling loop — if the panel never matches the expected job, it exits after the timeout, but subsequent code on line 1558 only checks `panelStillSynced` and if false, proceeds with extraction anyway.

**Side Effects & Dependencies:**
Prevents the bot from ever reaching the `attemptEasyApply` stage for affected jobs. The workflow engine hangs on this generator step.

**Fix Plan:**
⚠️ COMPLEXITY: High. Touches the most critical bot logic.
1. Wrap the entire body of `extractJobDetailsFromPanel` (lines 1517–1630) in a `Promise.race` with a hard timeout (e.g., 30 seconds):
   ```typescript
   const extractionTimeout = setTimeout(() => { /* throw or yield error */ }, 30000);
   try {
     // existing extraction logic
   } finally {
     clearTimeout(extractionTimeout);
   }
   ```
2. Add individual `try/catch` blocks around each `driver.findElement` call within the extraction to handle missing elements gracefully — yield partial data or skip that field.
3. After `waitForLinkedInPanelSync` returns with `synced: false` (line 1558), yield a clear failure message and `return` rather than continuing with stale panel data.
4. Files: `src/bots/linkedin/linkedin_impl.ts` lines 1517–1630.

---

### Issue #20: Tauri Dev Error: Session/Driver Crash

**Files Involved:**
- `src/bots/core/browser_manager.ts` — Selenium management

**Exact Lines:**
- `src/bots/core/browser_manager.ts` line 301: `const ONE_HOUR_MS = 60 * 60 * 1000;` (the staleness threshold constant)
- `src/bots/core/browser_manager.ts` line 312: `if (ageMs > ONE_HOUR_MS)` (staleness check — only removes LOCK files older than 1 hour)
- `src/bots/core/browser_manager.ts` lines 284–336: The entire `cleanStaleLockFiles` function

**Root Cause:**
When a Chrome instance crashes (or is force-killed), it leaves `LOCK` files in the user data directory (`sessions/<botName>/`). The `cleanStaleLockFiles` utility (line 284) only removes LOCK files older than 1 hour (line 312). If a developer restarts the bot immediately after a crash, the LOCK file is fresh (< 1 hour old) and is skipped (line 316–318). ChromeDriver then fails with `SessionNotCreatedError` because it can't acquire the lock.

The function is called on line 353 (inside `setupChromeDriver`) before Chrome is launched.

**Side Effects & Dependencies:**
Blocks rapid iteration during development and automated bot retries. Only affects setups where the session directory is reused (non-safe-mode).

**Original Intent vs. Breakdown:**
The 1-hour threshold was a safety measure to avoid removing LOCK files belonging to actively running Chrome instances. However, if Chrome crashed, the LOCK file is orphaned but recent.

**Fix Plan:**
1. `src/bots/core/browser_manager.ts` line 301: Reduce threshold from 1 hour to 5 minutes: `const STALE_THRESHOLD_MS = 5 * 60 * 1000;`. 5 minutes is a safe margin that still avoids removing active locks.
2. Better fix: Before the age check, verify if the Chrome process that created the LOCK is still running. LOCK files on Linux contain the PID. Read the LOCK file content, parse the PID, and check if that PID exists:
   ```typescript
   const lockContent = fs.readFileSync(lockFile, 'utf8').trim();
   const pid = parseInt(lockContent, 10);
   if (pid && !isNaN(pid)) {
     try {
       process.kill(pid, 0); // Check if process exists (doesn't actually kill)
       skippedCount++; // Process is alive, skip
       continue;
     } catch {
       // Process doesn't exist — LOCK is orphaned, safe to remove
     }
   }
   ```
   Insert this BEFORE the age check on line 312.
3. Complexity: Medium. PID-based check is more robust but platform-specific (Linux LOCK files contain PIDs; Windows/macOS may differ).

---
