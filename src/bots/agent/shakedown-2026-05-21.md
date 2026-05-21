# Shakedown Report — Bot Doctor Workflow Test
**Date:** 2026-05-21 07:29 +0545
**Bot:** linkedin
**Type:** Shakedown (workflow validation, NOT bot improvement)

---

## 🔍 PHASE 1 — PRE-FLIGHT

| Check | Status | Detail |
|-------|--------|--------|
| Chrome CDP (18800) | ✅ Recovered | Was down; relaunched from `/tmp/openclaw-chrome-profile` |
| MongoDB | ✅ OK | PID 50568, database: `inquisitive_mind` (NOT `questai` as blueprint assumes) |
| corpus-rag reachable | ✅ 200 | `http://localhost:3000/` responds |
| corpus-rag auth | ✅ Protected | `/api/scraped-jobs` returns 401 without Bearer token |
| **JWT token cache** | ❌ **BROKEN** | `.cache/jwt_tokens.json` contains literal shell variables (`'"$NEW_ACCESS"'`, `'"$NEW_REFRESH"'`) — never expanded |
| api_token.txt | ⚠️ Empty | No fallback token available |
| Git status | ⚠️ Modified | `AGENT_WORKFLOW.md` has uncommitted changes on `main` |
| Browser bounds | ⚠️ Unknown | `Browser.getWindowForTarget` returned `undefined` — method may need page target, not browser target |
| LinkedIn login | ✅ Logged in | Feed page loads without login wall |

### 🔴 CRITICAL FINDING: JWT Token Corruption

The file `.cache/jwt_tokens.json` contains literal unexpanded shell variables:
```json
{"accessToken":"'"$NEW_ACCESS"'","refreshToken":"'"$NEW_REFRESH"'","expiresAt":1779326122000}
```
This means ANY API call from the bot to corpus-rag will get a 401. Scraped jobs won't save, questions won't attach.

**Workflow gap:** Pre-flight check in SKILL.md says to check corpus-rag auth, but the `curl` test only hits an unprotected endpoint. The blueprint mentions checking a protected endpoint but the command is vague (`curl -s http://localhost:3000/api/some-protected-endpoint`). Need a concrete check like:
```bash
# Check if JWT tokens are real (not shell variable artifacts)
bun -e "const t=require('./.cache/jwt_tokens.json'); console.log(t.accessToken.startsWith('\"\\'\"') ? 'BROKEN_SHELL_VARS' : 'OK')"
```

---

## 🧪 PHASE 2 — FIND TEST JOB

**Database:** `inquisitive_mind` (blueprint says `questai` — **workflow gap**)

| Metric | Value |
|--------|-------|
| Total LinkedIn jobs | 11 |
| Easy Apply jobs | 7 |
| Applied jobs | 0 |
| Seek jobs | 0 |
| Indeed jobs | 0 |

**Test job selected:** Back End Developer @ See Me Please
- URL: `https://www.linkedin.com/jobs/view/4414996643/`
- Type: Easy Apply (internal), Sydney-based
- Status: scraped, unapplied

---

## 📊 PHASE 3 — BOT RUN RESULTS

**Command:** `bun src/bots/bot_starter.ts linkedin --url=... --mode=review`
**Duration:** ~12 seconds (very fast for a full flow — suspicious)

| Step | Result | Transition |
|------|--------|-------------|
| init_context | ✅ | `direct_apply_requested` |
| open_check_login | ✅ | `login_not_needed` |
| navigate_to_direct_apply_url | ✅ | `navigated` |
| attempt_easy_apply | ✅ | `modal_opened_successfully` |
| fill_contact_info | ⚠️ | `contact_info_filled` (but email/phone NOT filled — shadow DOM) |
| click_next_after_contact | ⚠️ | `ready_to_submit` (suspicious — single-page form?) |
| submit_application | ❌ | `application_failed` |
| application_failed | → | `application_marked_failed` |

### Failure Classification

| # | Type | Step | Detail |
|---|------|------|--------|
| 1 | **CONTACT_SHADOW_DOM** | fill_contact_info | Email + phone fields inside shadow DOM (`rootType: "shadowRoot"`). Bot returned "email: not found, phone: not found" but yielded SUCCESS anyway |
| 2 | **FLOW_CHANGED** | clickNextButton | Fallback returns `ready_to_submit` even when NO buttons found. Checked for "Submit" text in ALL buttons before checking for Next/Review — too eager |
| 3 | **SELECTOR_WRONG** | submitApplication | XPath `//button[contains(., 'Submit application') or contains(., 'Submit')]` — button text didn't match (likely "Review" instead, or modal wasn't properly at review step) |

### Root Cause Chain
```
fillContactInfo → shadow DOM → fields not found → yielded success anyway
  ↓
clickNextButton → no buttons in modal? → fallback → ready_to_submit (wrong!)
  ↓
submitApplication → looks for "Submit" text button → not found → application_failed
```

The bot never actually reached the review/submit page. It jumped there because `clickNextButton`'s fallback is `ready_to_submit`.

---

## 🔧 PHASE 4 — DIAGNOSIS (No Repairs — Shakedown)

Per user instruction, repairs skipped. Classified findings:

### Repairable Issues
1. **`clickNextButton` fallback** — Change default from `ready_to_submit` to `click_next_error` or `no_buttons_found`
2. **submit button selectors** — Add "Review" as candidate (`//button[contains(., 'Review')]`)
3. **contact info shadow DOM** — Need `driver.executeScript` with `shadowRoot.querySelector`

### Report-Only Issues (INFRA_FAILURE)
4. **JWT token corruption** — Shell variable expansion failed during token save
5. **Database name mismatch** — Blueprint says `questai`, actual is `inquisitive_mind`

---

## 🐛 WORKFLOW GAPS DISCOVERED

| Gap | Location | Fix Needed |
|-----|----------|------------|
| DB name hardcoded as `questai` | SKILL.md, blueprint | Make configurable or auto-detect |
| Protected endpoint check is vague | SKILL.md Phase 1 | Add concrete JWT file validation command |
| `Browser.getWindowForTarget` returns undefined | SKILL.md Phase 1 | Use page target ID, not browser target ID |
| Bot yield on shadow DOM failure | linkedin_impl.ts | Should yield `contact_fill_failed` not `contact_info_filled` |
| clickNextButton fallback is `ready_to_submit` | linkedin_impl.ts line 3404 | Should be `click_next_error` or check for actual submit presence |
| `openclaw browser` might hang in embedded mode | SKILL.md | Already noted in blueprint as known pattern |

---

## 📋 FINAL SUMMARY

```
═══════════════════════════════════════════════════
  QUESTAI BOT HEALTH — linkedin
  SHAKEDOWN RUN | 2026-05-21 07:29 +0545
═══════════════════════════════════════════════════

🔍 PRE-FLIGHT
  ✅ Chrome CDP (recovered from crash)
  ✅ MongoDB (inquisitive_mind, 11 jobs)
  ✅ corpus-rag reachable
  ❌ JWT TOKENS CORRUPTED (shell vars unexpanded)
  ⚠️  Browser bounds check broken (wrong target)
  ⚠️  AGENT_WORKFLOW.md modified on main

🧪 TEST JOB
  URL: https://www.linkedin.com/jobs/view/4414996643/
  Title: Back End Developer @ See Me Please
  Type: Easy Apply | Status: scraped, unapplied

📊 BOT RUN (7 steps)
  ✅ 4 passed
  ⚠️  2 yielded wrong transitions (shadow DOM + eager submit check)
  ❌ 1 failed (submit button not found)

🔧 CLASSIFIED
  🟡 CONTACT_SHADOW_DOM — fields not filled, success yielded anyway
  🟡 FLOW_CHANGED — clickNextButton default is ready_to_submit
  🟡 SELECTOR_WRONG — submit button text mismatch
  🔴 INFRA_FAILURE — JWT tokens corrupted

🐛 WORKFLOW GAPS: 6 found
  • DB name mismatch (questai vs inquisitive_mind)
  • Vague pre-flight auth check
  • Browser bounds check needs page target
  • Bot doesn't detect shadow DOM contact failure
  • clickNextButton fallback too optimistic
  • openclaw browser may hang in embedded mode

🌿 BRANCH: No repairs made (shakedown only)

───────────────────────────────────────────────────
  SUMMARY: 3 bot issues found, 0 fixed, 1 infra failure
  Workflow validated — gaps documented above
  Ready for first real repair session 🏥
═══════════════════════════════════════════════════
```
