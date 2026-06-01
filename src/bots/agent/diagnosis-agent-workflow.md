# QuestAI Diagnostic & Repair Agent — Blueprint

## Purpose

An autonomous agent (run via OpenClaw on-demand) that:

1. **Tests** a single bot (linkedin, seek, or indeed) against a live job
2. **Detects** failures — stale selectors, flow changes, auth issues, timeouts
3. **Repairs** selector issues by inspecting the live page and updating code
4. **Reports** flow/auth changes that need human attention
5. **Self-improves**: every run finds cracks in the diagnostic workflow itself
   and updates this blueprint + the SKILL.md accordingly.

**Early-stage note (2026-05-21)**: This workflow is being actively shakedown-tested.
The first few runs prioritize finding and fixing workflow gaps over bot repairs.
Every discovery feeds back into the pre-flight checks and failure patterns.
5. Slowly transforms bots into **true state machines** that observe page state and branch dynamically

## Trigger

User says: `"check linkedin"` / `"check seek"` / `"check indeed"`

One bot at a time. No bulk mode.

---

## Architecture Overview

```
User: "check linkedin"
       │
       ▼
┌──────────────────────────────────────────────────┐
│ PHASE 1 — PRE-FLIGHT                             │
│ ├─ Browser session alive? Cookie check           │
│ ├─ API endpoints reachable? JWT valid?           │
│ └─ Chrome/ChromeDriver available?                │
├──────────────────────────────────────────────────┤
│ PHASE 2 — FIND A TEST JOB                        │
│ ├─ Search for recent Easy Apply jobs             │
│ ├─ Cross-reference MongoDB: which unapplied?     │
│ ├─ Pick 1-2 with Easy Apply badge                │
│ └─ No EA jobs? Fall back to extract-only test    │
├──────────────────────────────────────────────────┤
│ PHASE 3 — RUN BOT, WATCH IT                      │
│ ├─ Run bot_starter.ts in --mode=review           │
│ │   (all clicks, NO submit)                      │
│ ├─ Capture every [BOT_EVENT] + stderr            │
│ ├─ Classify each failure                         │
│ └─ Build structured failure report               │
├──────────────────────────────────────────────────┤
│ PHASE 4 — DIAGNOSE & REPAIR                      │
│ ├─ For each failure: open browser, inspect DOM   │
│ ├─ SELECTOR issues → fix selectors.json          │
│ ├─ SELECTOR issues → fix impl.ts if needed       │
│ ├─ FLOW changes → add YAML transitions/steps     │
│ ├─ Create new step functions if needed           │
│ ├─ ALL on a git branch: repair/{bot}-YYYY-MM-DD  │
│ └─ Re-test after each fix, iterate               │
├──────────────────────────────────────────────────┤
│ PHASE 5 — REPORT                                 │
│ ├─ What was tested, what passed, what failed     │
│ ├─ What was fixed, what needs human              │
│ ├─ Branch name + commit summary                  │
│ └─ API/JWT health status                         │
└──────────────────────────────────────────────────┘
```

---

## 🆕 Phase 0 — Run History Trend Analysis (NEW)

Before running any diagnostic test, analyze the run history to avoid redundant work.

### Instructions
1. Read `src/bots/agent/bot-run-history.jsonl` (if it exists)
2. Parse all JSON lines into an array of run entries
3. Filter to entries matching the target bot variant (e.g., `linkedin_extract`, `seek_apply`)
4. Produce a trend summary:
   - Last run: when, what result, what failed
   - Last 5 runs: pass/fail/crash distribution
   - Most common failure_type across all runs
   - Any step that failed in 100% of runs (design issue, not a bug)
   - Session/auth status from preflight

### Decision: Skip or Run?
- If the same failure_type has occurred in 3+ consecutive runs with the same failed_at_step → **SKIP the test** and proceed directly to Phase 4 (repair) with trend context
- If the last run was `all_pass` and no code changes since → **SKIP** unless > 3 days since last run
- If auth is broken (AUTH_BROKEN in last run) → **SKIP** and notify user to re-authenticate
- Otherwise → **RUN** the test (proceed to Phase 1)

### If Skipping
Report: "Skipping test run — {reason}. Last {n} runs show persistent {failure_type} at {step}. Proceeding directly to repair phase."

---

## Phase 1 — Pre-Flight Health Check

Before touching any bot code, verify the infrastructure:

| Check | How | Failure Action |
|-------|-----|----------------|
| LinkedIn/Seek/Indeed logged in? | Navigate to feed/home, check for login wall | Report, abort test |
| corpus-rag API reachable? | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` | Report and fix — NOT optional |
| corpus-rag authenticated? | Hit a protected endpoint (questions-save, etc.); check for 401 | Report, user must re-login to corpus-rag UI |
| MongoDB connected? | `mongosh --eval "db.runCommand({ping:1})"` — note: DB is `inquisitive_mind`, collection `linkedin_jobs` | Report, continue (file fallback) |
| Chrome CDP running? | `curl -s http://localhost:18800/json/version` | Relaunch; keep separate from bot's Selenium browser |
| Browser window maximized? | CDP: `Browser.getWindowForTarget` check bounds.width ≥ 1280 | Maximize — responsive UI breaks selectors at narrow widths |
| Git clean + on main? | `git status --short && git branch --show-current` | Report, stash or abort |

---

## Phase 2 — Find a Test Job

**CRITICAL**: The apply flow needs a job that was already EXTRACTED to the DB.
Direct `--url` apply skips extraction → corpus-rag returns 404 "No existing job found".
Always query MongoDB first for extracted-but-unapplied Easy Apply jobs.

Jobs expire, so we find one fresh each time.

**Important**: LinkedIn UI is responsive — browser must be ≥1280px wide.
If `openclaw browser` hangs (embedded/local mode), fall back to raw CDP WebSocket.

**Easy Apply marker**: Check for both `<button>` and `<a>` tags containing "Easy Apply".
LinkedIn changes this periodically.

```
1. Open LinkedIn jobs search with keyword from user config
2. Apply "Easy Apply" filter if available
3. Scroll to load 2-3 pages of results
4. Extract job cards (ID, title, company, has-easy-apply-badge)
5. For each candidate:
   a. Check MongoDB: has this job_id been applied already?
   b. Skip if applied, keep if unapplied
6. Pick the first unapplied Easy Apply job
7. If none found: skip apply test, only run extract test
8. Store picked job URLs in agent/test_jobs.json (ephemeral cache)
```

MongoDB query pattern (once DB access is wired):
```js
db.applied_jobs.findOne({ job_id: candidateId, platform: "linkedin" })
```

### 🆕 Cross-reference with run history
- Query MongoDB for unapplied Easy Apply jobs
- Cross-ref with `bot-run-history.jsonl` — exclude jobs that have been tested in the last 3 runs
- Pick the freshest untested Easy Apply job
- If no untested EA jobs remain → "All Easy Apply jobs have been tested recently. Pick the oldest unapplied job or run extract-only."

---

## 🆕 Phase 2.5 — Config Sanity Checks (NEW)

Before running the bot, validate its configuration.

### Checks
1. **Keywords & Location**: If `config.formData.keywords` is empty or `config.formData.locations` is empty → warn "Empty search terms — bot may produce 0 results"
2. **Salary**: If `config.formData.minSalary` is a raw number (not formatted for the platform) → warn "minSalary may produce unexpected search queries"
3. **botMode mismatch**: If config has `superbot: true` but mode is `review` → warn "superbot config active but running in review mode — bots will NOT auto-apply"
4. **BOT_EXTRACT_LIMIT**: Check env var — if set, note it overrides `--limit=`
5. **Config staleness**: If `config_form.yaml` or `*_selectors.json` hasn't been modified in > 14 days → warn "Config may be stale"
6. **Git state**: Uncommitted changes? Open repair branches? → flag them

### Output
Produce a brief sanity report. If any warnings, ask: "Proceed anyway? (y/n)"

---

## Phase 3 — Run Bot & Classify Failures

### Running the bot

```bash
cd ~/inquisitive_mind/questai
bun src/bots/bot_starter.ts linkedin \
  --url=<test_job_url> \
  --mode=review \
  2>&1 | tee agent/logs/last-run-linkedin-$(date +%Y-%m-%d).log
```

### Failure Classification

Every step that doesn't yield its "success" transition is classified:

| Failure Type | Signature | Example |
|-------------|-----------|---------|
| `SELECTOR_STALE` | `NoSuchElementError` on a known selector | `.jobs-easy-apply-modal` not found |
| `SELECTOR_WRONG` | Element found but wrong tag/element type | Easy Apply is `<a>` not `<button>` |
| `FLOW_CHANGED` | Expected page state never appeared, or infinite loop | Clicked Easy Apply, no modal opened; or questions→next→questions forever |
| `AUTH_BROKEN` | Login wall, CAPTCHA, verification prompt | Redirected to /login or /checkpoint |
| `TIMEOUT` | Step exceeded its timeout | 30s timeout on `fillContactInfo` |
| `ANTI_BOT` | 429, rate limit, "unusual activity" | Page shows security check |
| `INFRA_FAILURE` | Backend API down, token expired, Chrome crash | corpus-rag returns 401, questions loop because save fails |

### Structured Failure Report

```json
{
  "bot": "linkedin",
  "timestamp": "2026-05-21T05:00:00Z",
  "test_job_url": "https://www.linkedin.com/jobs/view/123456789/",
  "test_job_id": "123456789",
  "mode": "review",
  "steps": [
    {
      "step": "open_check_login",
      "status": "OK",
      "transition": "login_not_needed",
      "duration_ms": 3200
    },
    {
      "step": "attempt_easy_apply",
      "status": "FAILED",
      "failure_type": "SELECTOR_STALE",
      "selector_attempted": "button.jobs-apply-button[aria-label*='Easy Apply']",
      "error": "NoSuchElementError: no such element",
      "duration_ms": 15000
    }
  ],
  "summary": {
    "total_steps": 12,
    "passed": 10,
    "failed": 2,
    "failure_types": { "SELECTOR_STALE": 1, "TIMEOUT": 1 }
  }
}
```

---

## Phase 4 — Diagnose & Repair

### Guiding Principles

1. **All repairs happen on a temp branch**: `repair/{bot}-YYYY-MM-DD`
2. **Repair scope is aggressive but contained**: Only files in `src/bots/{bot}/`
3. **Re-test after every fix**: Iterate until bot passes or hits a non-repairable failure
4. **True state machine**: Every repair adds page-state observation, not just try/catch

### 4a. Selector Repair

When a selector is stale:

```
1. Open browser to the exact URL where it failed
2. Take AI snapshot: openclaw browser snapshot --format ai
3. Analyze the DOM for the missing element:
   a. Search by text content that matches expected behavior
   b. Search by aria-label, role, data-testid
   c. Search by structural proximity (what's near where it should be)
   d. Search by partial class name pattern
4. Find the best replacement selector
5. Update selectors.json:
   - Add new selector to the candidates array (front of array)
   - Deprecate broken selector (move to end, add comment with date)
   - Or replace entirely if the old one is clearly dead
6. If the impl.ts uses a hardcoded selector (not from selectors.json):
   - Move it to selectors.json
   - Update impl.ts to read from selectors
```

### 4b. Impl.ts Repair

When the implementation strategy needs to change:

| Situation | Fix |
|-----------|-----|
| Element inside shadow DOM | Add `driver.executeScript()` to pierce shadow root |
| Element inside iframe | Add `driver.switchTo().frame()` |
| Need different wait strategy | Change `until.elementLocated` → `until.elementIsVisible` |
| Click intercepted | Add scroll-into-view + JavaScript click fallback |
| New page state discovered | Add observation logic + new yield event |

### 4c. YAML Repair — Building a True State Machine

This is the core philosophy. Instead of:

```yaml
# ❌ Fake state machine (current pattern)
some_step:
  func: "doThing"
  transitions:
    success: "next_step"
    error: "finish"         # everything is just "error"
```

We build:

```yaml
# ✅ True state machine (agent's goal)
some_step:
  func: "doThing"
  transitions:
    modal_opened: "fill_contact_info"
    already_applied: "mark_already_applied"    # NEW
    job_expired: "mark_job_expired"            # NEW
    sign_in_challenge: "handle_mid_flow_auth"  # NEW
    verification_required: "report_verification_wall"  # NEW
    single_page_form: "fill_single_page_contact"      # NEW
    multi_page_form: "fill_contact_info"              # existing
    element_not_found: "repair_or_skip"        # NEW
```

The agent adds transitions and corresponding steps by:

1. Observing what actually appeared on screen (not what was expected)
2. Classifying the observed state (already applied? new form type? auth wall?)
3. Adding the transition to YAML
4. Creating the target step function in impl.ts if it doesn't exist
5. Wiring the new step back into the flow

### 4d. Creating New Step Functions

When a new scenario needs a new step:

```typescript
// Agent-generated step function
async function* markAlreadyApplied(ctx: WorkflowContext) {
  const driver = ctx.driver as WebDriver;
  logger.info('linkedin.already_applied', 'Job was already applied to', {
    jobId: ctx.current_job_id,
    jobTitle: ctx.current_job_title
  });
  
  // Record in MongoDB
  await recordJobApplicationToBackend({
    jobId: ctx.current_job_id,
    status: 'already_applied',
    platform: 'linkedin',
    detectedAt: new Date().toISOString()
  });
  
  yield 'job_already_applied';
}
```

---

## Phase 5 — Report Format

```
═══════════════════════════════════════════════
  QUESTAI BOT HEALTH REPORT
  Bot: linkedin | Date: 2026-05-21 05:30 +0545
═══════════════════════════════════════════════

🔍 PRE-FLIGHT
  ✅ LinkedIn logged in (session valid)
  ✅ corpus-rag API healthy (200)
  ⚠️  JWT expires in 3 days (2026-05-24)
  ✅ MongoDB connected

🧪 TEST JOB
  URL: https://www.linkedin.com/jobs/view/987654321/
  Title: Senior Node.js Developer at TechCorp
  Type: Easy Apply (3-step)

📊 EXTRACT FLOW (10 steps)
  ✅ open_check_login → login_not_needed
  ✅ open_jobs_page → jobs_page_loaded
  ✅ set_search_keywords → search_keywords_set
  ✅ set_search_location → search_location_set
  ✅ apply_filters → filters_applied_successfully
  ✅ get_page_info → page_info_extracted
  ✅ extract_job_details → jobs_prepared
  ✅ open_current_job_card → job_card_opened
  ✅ parse_job_details_from_panel → job_details_extracted
  ✅ save_scraped_job → job_saved
  RESULT: All extract steps passed ✅

📊 APPLY FLOW (12 steps)
  ✅ navigate_to_direct_apply_url → navigated
  ❌ attempt_easy_apply → SELECTOR_STALE
     Selector: button.jobs-apply-button[aria-label*='Easy Apply']
     🔧 FIXED → new selector: button.jobs-apply-button[aria-label*='Easy Apply to']
  ✅ modal_opened_successfully → (re-test)
  ✅ fill_contact_info → contact_info_filled
  ✅ click_next_after_contact → clicked_next
  ✅ upload_resume → resume_uploaded_successfully
  ✅ click_next_to_questions → clicked_next
  ⚠️  extract_employer_questions → FLOW_CHANGED
     New page state: "Salary expectations" step appeared before questions
     🔧 FIXED → added fill_salary_expectations step to YAML + impl
  ✅ answer_questions → questions_answered
  ✅ submit_application → (reached, NOT clicked in review mode)
  RESULT: 1 selector fixed, 1 flow change handled 🔧

🌿 BRANCH: repair/linkedin-2026-05-21
  Commits:
    a1b2c3d fix: update Easy Apply button selector (stale CSS class)
    e4f5g6h feat: add salary_expectations step for new LinkedIn flow
  Review & merge: cd ~/inquisitive_mind/questai && git merge repair/linkedin-2026-05-21

═══════════════════════════════════════════════
  SUMMARY: 2 issues found, 2 fixed, 0 need human
  Bot is ready to run in production mode ✅
═══════════════════════════════════════════════
```

### 🆕 Include trend context in report
- Compare this run's failures against historical patterns
- If a step failed in this run AND in previous runs → flag as "PERSISTENT" (design issue)
- If a step failed for the first time → flag as "REGRESSION" (new bug)
- If a previously-failing step now passes → flag as "FIX CONFIRMED"
- Show failure_type distribution from run history for context

---

## File Structure

```
src/bots/agent/
  ├── diagnosis-agent-workflow.md    ← This document (canonical process)
  ├── bot-run-history.jsonl          ← Structured run history for trend analysis
  ├── test_jobs.json                 ← Ephemeral cache of last found test jobs
  ├── logs/                          ← TEE output from diagnostic runs (deletable)
  │   └── last-run-{bot}-YYYY-MM-DD.log
  └── reports/                       ← Historical shakedown test reports
      └── shakedown-report-{bot}-YYYY-MM-DD.md
```

Additional modules (future, if extracted from OpenClaw workflow):
```
  ├── diagnostic_runner.ts     ← Runs bot, captures structured failure report
  ├── failure_classifier.ts    ← SELECTOR_STALE | WRONG | FLOW | AUTH | TIMEOUT
  ├── selector_repairer.ts     ← Browser inspection → new selectors
  ├── yaml_patcher.ts          ← Add/update transitions and steps in YAML
  └── impl_patcher.ts          ← Modify/create step functions in impl.ts
```

---

## Known Failure Patterns (Discovered 2026-05-21)

These are recurring failure modes discovered during live diagnostic runs.
Check these first before diving into deep diagnosis.

| Pattern | Cause | Fix |
|---------|-------|-----|
| Easy Apply button not found | LinkedIn changed `<button>` to `<a>` tag | Add `a[aria-label*='Easy Apply']`, `//a[contains(., 'Easy Apply')]` to candidates |
| Questions → Next → Questions loop (401) | corpus-rag token expired → DB save fails → bot yields success anyway | Pre-flight must check corpus-rag auth. Bot should NOT yield `employer_questions_saved` on API error. |
| Questions → Next → Questions loop (404) | API requires job record to exist before attaching questions. Bot doesn't create job first. | Bot must create job record before saving questions. OR API must support upsert. |
| Questions → Next → Questions loop (flow bug) | `clickNextButton` always returns `clicked_next`, never `ready_to_submit`. YAML has no exit from the questions→next→questions cycle. | Add page-state observation to `clickNextButton`: detect review/submit page. Add max-retry counter to YAML as safety net. |
| `openclaw browser` hangs | Embedded/local mode doesn't support browser tool | Fall back to raw CDP WebSocket via `bun` |
| Chrome CDP dies mid-diagnosis | Bot's Selenium closes its browser, which may kill shared Chrome | Use separate Chrome instance for CDP diagnostics (dedicated profile at `/tmp/openclaw-chrome-profile`) |
| Random selector failure | Browser window not maximized → responsive UI → different DOM | Always verify `window.outerWidth ≥ 1280` before running |
| Token refresh fails silently | `.cache/jwt_tokens.json` missing → bot uses expired token from `api_token.txt` | Pre-flight: verify token expiry AND that jwt_tokens.json exists. If missing, call `/api/auth/refresh` directly with stored refresh token. |
| JWT tokens corrupted | `<< 'EOF'` (quoted heredoc) used when writing jwt_tokens.json → literal `$VAR` text stored | Pre-flight: validate JWT file with bun script. Fix with unquoted heredoc. |
| DB/collection name mismatch | Code assumes `questai.jobs` but actual is `inquisitive_mind.linkedin_jobs` | All MongoDB queries must use correct DB + collection names. |
| Shadow DOM contact info skips | `fillContactInfo` yields `contact_info_filled` but email/phone "not found" inside shadowRoot | Bot needs `executeScript` with `shadowRoot.querySelector`. Don't yield success on failure. |
| clickNextButton jumps to submit | Fallback returns `ready_to_submit` when no buttons found → skips resume/questions | Change fallback to `click_next_error`. Only yield `ready_to_submit` when Submit/Review ACTUALLY visible. |
| 🚨 Review mode doesn't prevent submit | `--mode=review` supposed to stop at review page, but `submitApplication` may still click Submit | DO NOT run in review mode on real jobs without verifying. Bot must have explicit guard: `if (reviewMode) { yield 'review_reached'; return; }` before clicking submit. |
| Browser bounds check broken | `Browser.getWindowForTarget` with browser target returns undefined | Use a page target ID (from `curl http://localhost:18800/json`), not browser target. |

---

## Repair Boundaries

| Can fix | Cannot fix (report only) |
|---------|--------------------------|
| Stale CSS selectors | Login/credential failures |
| Missing/wrong XPath selectors | CAPTCHA / anti-bot walls |
| Wait strategy (visibility vs presence) | API endpoint changes |
| Shadow DOM / iframe navigation | Site completely redesigned |
| YAML transitions for new page states | Auth token refresh logic |
| New step functions for discovered flows | MongoDB schema changes |
| Timeout adjustments | .env or config changes |
| Adding candidates to selector arrays | corpus-rag down / 401 token |
| | Chrome CDP crash |
| | Changes outside `src/bots/{bot}/` |

All repairs stay within `src/bots/{bot}/` directory.
All repairs happen on a git branch — never on main.

---

## Git Workflow

```bash
# Agent creates branch
git checkout -b repair/linkedin-2026-05-21

# Agent makes changes (selectors.json, YAML, impl.ts)
# Agent re-tests after each change
# Agent commits

git add src/bots/linkedin/linkedin_selectors.json
git commit -m "fix(linkedin): update Easy Apply button selector

Selector 'button.jobs-apply-button[aria-label*=\"Easy Apply\"]' is stale.
LinkedIn changed aria-label to 'Easy Apply to {company}'.
Added new candidate with partial match.

Tested: job 987654321, reached Submit step in review mode."

# User reviews:
#   cd ~/inquisitive_mind/questai
#   git log repair/linkedin-2026-05-21
#   git diff main...repair/linkedin-2026-05-21
#   git merge repair/linkedin-2026-05-21
#   git branch -d repair/linkedin-2026-05-21
```

---

## True State Machine — Long-Term Vision

Over successive repair sessions, each bot evolves from:

```
Current (try/catch):
  step → try { action } catch { error }
  Only 2 possible yields, no page state observation
```

To:

```
Target (state machine):
  step → perform action
       → observe page state (what actually appeared?)
       → yield specific event based on observation
       → 5-8 possible yields covering real scenarios
        
  Each yield maps to a handler step that knows what to do:
  - already_applied → record and skip
  - job_expired → record and skip  
  - sign_in_required → handle auth
  - verification_wall → record and skip
  - single_page_form → optimized flow
  - multi_page_form → standard flow
  - unexpected_state → screenshot, skip, report
```

The agent builds this incrementally. Each repair session adds one or two new observed states. Over 5-10 sessions, the bot becomes genuinely resilient — not because it never breaks, but because it **knows what to do when things don't go as planned**.
