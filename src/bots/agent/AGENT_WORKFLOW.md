# QuestAI Diagnostic & Repair Agent — Blueprint

## Purpose

An autonomous agent (run via OpenClaw on-demand) that:

1. **Tests** a single bot (linkedin, seek, or indeed) against a live job
2. **Detects** failures — stale selectors, flow changes, auth issues, timeouts
3. **Repairs** selector issues by inspecting the live page and updating code
4. **Reports** flow/auth changes that need human attention
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

## Phase 1 — Pre-Flight Health Check

Before touching any bot code, verify the infrastructure:

| Check | How | Failure Action |
|-------|-----|----------------|
| LinkedIn/Seek/Indeed logged in? | Navigate to feed/home, check for login wall | Report, abort test |
| corpus-rag API reachable? | `curl -s -o /dev/null -w "%{http_code}" <api_url>` | Report, continue (only affects Q&A) |
| JWT token valid? | Decode JWT, check `exp` claim vs current time | Report days remaining |
| MongoDB connected? | `mongosh --eval "db.runCommand({ping:1})"` | Report, continue (file fallback) |
| Chrome running on CDP port? | `curl -s http://localhost:18800/json/version` | Attempt restart, or report |

---

## Phase 2 — Find a Test Job

Jobs expire, so we find one fresh each time:

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

---

## Phase 3 — Run Bot & Classify Failures

### Running the bot

```bash
cd ~/inquisitive_mind/questai
bun src/bots/bot_starter.ts linkedin \
  --url=<test_job_url> \
  --mode=review \
  2>&1 | tee agent/last_run.log
```

### Failure Classification

Every step that doesn't yield its "success" transition is classified:

| Failure Type | Signature | Example |
|-------------|-----------|---------|
| `SELECTOR_STALE` | `NoSuchElementError` on a known selector | `.jobs-easy-apply-modal` not found |
| `SELECTOR_WRONG` | Element found but wrong content/state | Found button but it's disabled |
| `FLOW_CHANGED` | Expected page state never appeared | Clicked Easy Apply, no modal opened |
| `AUTH_BROKEN` | Login wall, CAPTCHA, verification prompt | Redirected to /login or /checkpoint |
| `TIMEOUT` | Step exceeded its timeout | 30s timeout on `fillContactInfo` |
| `ANTI_BOT` | 429, rate limit, "unusual activity" | Page shows security check |

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

---

## File Structure

```
src/bots/agent/
  ├── AGENT_WORKFLOW.md        ← This document (canonical process)
  ├── test_jobs.json           ← Ephemeral cache of last found test jobs
  └── last_run.log             ← Raw output of most recent bot_starter.ts run
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
| Adding candidates to selector arrays | Changes outside `src/bots/{bot}/` |

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
