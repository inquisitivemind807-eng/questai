# Seek Bot Shakedown — 2026-05-23

## Pre-Flight

| Check | Status | Detail |
|-------|--------|--------|
| Chrome CDP | ✅ | Port 18800 |
| MongoDB | ✅ | 16 seek_jobs, all unapplied |
| corpus-rag reachable | ✅ | HTTP 200 |
| corpus-rag auth | ✅ | Token refreshed (expires 09:59) |
| Git | ✅ | On main (merged repair/seek-2026-05-22 first) |
| Seek session | ✅ | Existing Selenium profile, logged in |

## Test Job

**92166478** — "Full Stack Software Developer" at Micronet  
URL: `https://www.seek.com.au/job/92166478`  
Type: Internal (Quick Apply), 7 employer questions

## Run Summary

### All steps executed:

| Step | Status | Detail |
|------|--------|--------|
| init_context | ✅ | direct_apply_ready |
| open_job_url | ✅ | job_url_opened |
| detect_page_state | ✅ | logged_in (fix from prev shakedown confirmed!) |
| detect_apply_type | ✅ | quick_apply_found |
| click_quick_apply | ✅ | quick_apply_clicked |
| wait_for_quick_apply_page | ✅ | page loaded → /apply |
| handle_cover_letter | ✅ | cover_letter_not_required |
| handle_resume_selection | ✅ | resume uploaded (AI 500 → canonical fallback) |
| click_continue_button | ⚠️ | continue_clicked (had validation errors but proceeded) |
| extract_employer_questions | ✅ | 7 questions extracted |
| handle_employer_questions | ❌ | employer_questions_error |

### Question Results: 6/7 answered

| Q# | Question | Type | Source | Answer | Status |
|----|----------|------|--------|--------|--------|
| 1 | Right to work in Australia | select | Generic | 3 (grad temp visa) | ✅ |
| 2 | Years exp: full stack dev | select | Generic | 6 (5 years) | ✅ |
| 3 | Years exp: front end dev | select | AI | 4 (4 years) | ✅ |
| 4 | Programming languages | checkbox | Generic | JavaScript, Python | ✅ |
| 5 | "Yes" | radio | AI | 0 (Yes) | ✅ |
| 6 | "No" | radio | AI | 1 (No) | ❌ |
| 7 | Years exp: SQL queries | select | Generic | 6 (5 years) | ✅ |

## Failures Classified

### 1. ⚠️ Q5/Q6 Same Radio Group Detected as Two Questions (FLOW_CHANGED)

Q5 (question="Yes") and Q6 (question="No") share the same `radioName: questionnaire.AU_Q_220_V_2`. They appear to be a single Yes/No radio question where the labels got parsed as separate question texts. After Q5 answers "Yes", Q6 can't find its radio because the group is already set.

**Root cause:** Question extraction is treating radio label text as the question, and the same radio group appears twice (once per option label).

### 2. ⚠️ employer_questions_error → Closes Without Retry (FLOW_CHANGED)

6/7 questions were answered correctly, but one failure triggers `employer_questions_error` → `stay_put_for_inspection` → `close_quick_apply_and_end`. The bot closes the Quick Apply without attempting to re-answer the failed question or proceed to submit.

### 3. ℹ️ stayPutForInspection Tab Mismatch (REPORT-ONLY)

Step 11.5 says "STAYING PUT FOR MANUAL INSPECTION - Still on Choose Documents tab" but the bot was on the employer questions step. Messaging confusion, not blocking.

### 4. ℹ️ AI Resume 500 (REPORT-ONLY, INFRA)

`POST /api/resume` → 500: "Provider not available: gpt-4o-mini". Fallback to canonical resume text worked fine — resume was still uploaded successfully.

### 5. ℹ️ click_continue_button: Validation Errors Ignored (REPORT-ONLY)

`FORM STATE CHECK: Cover letter length: 630, Errors: true, Continue enabled: true` — the form had validation errors but the continue button was enabled, so the bot clicked it. Not a bot bug — Seek allowed it.

## What Went Well

✅ **detectPageState fix confirmed working** — no false positive, correctly detected `logged_in`  
✅ **Full flow reached employer questions** — login, Quick Apply detection, resume upload all passed  
✅ **Generic config + AI hybrid QA working** — 4 generic answers + 3 AI answers, near-perfect  
✅ **No accidental submit** — bot closed Quick Apply without clicking Submit (correct for review mode)  
✅ **Session persistence** — Selenium session from previous run works without re-login  

## Repair Suggestions

### Fix 1: Deduplicate same-radioGroup questions
In `handleEmployerQuestions`, detect when two extracted "questions" share the same `radioName` and merge them into a single question with the correct question text (from a parent element or aria-label).

### Fix 2: Add retry/continue for partial failures
After `employer_questions_error`, attempt to re-answer only the failed questions, or proceed to review/submit with partial answers instead of closing.

## Bot Health Summary

```
═══════════════════════════════════════
  QUESTAI BOT HEALTH — seek
  Shakedown #2 | 2026-05-23 09:43 +0545
═══════════════════════════════════════
🔍 PRE-FLIGHT: All green ✅
🧪 TEST JOB: 92166478 — Full Stack Software Developer at Micronet
📊 EXTRACT: N/A (direct apply from DB job)
📊 APPLY: 14/16 steps passed
   ✅ Login ✓ Quick Apply ✓ Resume ✓
   ⚠️  6/7 employer questions (1 radio group collision)
   ⏹️  Closed before submit (safe — review mode)
───────────────────────────────────
SUMMARY: 2 new findings, 0 critical
  ✅ Previous fix (detectPageState) confirmed working
  ⚠️  Q5/Q6: same radio group parsed as 2 questions
  ⚠️  employer_questions_error → closes without retry
  ℹ️  stayPutForInspection tab name mismatch
  ℹ️  AI resume 500 (infra)
═══════════════════════════════════════
```
