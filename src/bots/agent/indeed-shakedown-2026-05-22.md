# Indeed Bot Shakedown — 2026-05-22

## Pre-Flight Results

| Check | Status | Detail |
|-------|--------|--------|
| Chrome CDP | ✅ | Port 18800, Chrome 148 |
| MongoDB | ✅ | inquisitive_mind DB, 23 collections |
| corpus-rag reachable | ✅ | HTTP 200 |
| corpus-rag auth | ✅ | Token valid |
| Git | ✅ | On main, clean checkout |
| Indeed session | ⚠️ | Camoufox profile exists but **all cookies expired** (1970 epoch) |
| Browser maximized | ✅ | N/A (Camoufox sets 1920×1080) |
| Indeed DB jobs | ❌ | `indeed_jobs` collection has 0 documents |

## Run Summary

**Mode:** Extract-only (fallback — no jobs in DB)

**Config:** keywords=`developer`, location=`sydney`, minSalary=`2000` (number)

### Run 1 — Crashed on login check
```
minSalary.includes is not a function
```
- **Root cause:** `buildSearchUrl()` in `indeed_impl.ts:214` — `minSalary` from JSON config is `2000` (number), but code called `.includes('$')` without string coercion
- **Cascading:** Crashed inside `openCheckLogin()` → YAML transitioned to `show_manual_login_prompt` → bot stuck waiting for manual input

### Run 2 — After fix
- ✅ `buildSearchUrl` now builds correct URL: `https://www.indeed.com/jobs?q=developer+%242000&l=sydney`
- ✅ Login check runs correctly — detects 1 sign-in button, no auth cookies
- ❌ **AUTH_BROKEN:** Indeed session cookies expired — `SURF`, `CTK`, `LV`, `PREF` all have 1970-01-01 expiry. No `SHOE` or `PassportAuthProxy` cookies.

## Failures Classified

| # | Type | Fixable? | Detail |
|---|------|----------|--------|
| 1 | BUG (type coercion) | ✅ Fixed | `minSalary.includes()` crash — added `String()` wrapper |
| 2 | AUTH_BROKEN | ❌ Report-only | Indeed session cookies expired, needs manual re-login |
| 3 | REPORT-ONLY | ❌ | `Overlay addLogEvent: null is not an object (evaluating 'state.data')` — non-blocking overlay JS error |
| 4 | REPORT-ONLY | ❌ | `adapter.executeScript error: evaluate: The operation is insecure` — Camoufox/Playwright compatibility with overlay system |

## Repair Applied

**Branch:** `repair/indeed-2026-05-22`

**Commit:** `526c1a9` — `fix(indeed): coerce minSalary to string in buildSearchUrl`

```diff
- const minSalary = fd.minSalary || '';
+ const minSalary = String(fd.minSalary || '');
```

**Why:** `minSalary` from `user-bots-config.json` is stored as number `2000`. The `|| ''` fallback doesn't trigger for truthy numbers, so `minSalary` remained number type. `.includes('$')` is a string method → TypeError.

**Note:** Also found `remotePreference` on line 202 has the same pattern (`(fd.remotePreference || '').toLowerCase()`) — not currently crashing but same vulnerability if remotePreference is ever a number. Left for next session.

## What Needs Human

1. **🔴 Indeed login:** Manual re-authentication required. Open Camoufox browser with the profile at `sessions/indeed/camoufox_profile/` and sign into Indeed. All session cookies expired.

2. **🟡 minSalary config:** The `minSalary: 2000` value gets appended to search query as `$2000`, making Indeed search for literal `developer $2000`. This is the current behavior (unchanged by fix) — adjust config if search results are poor.

3. **🟡 Overlay security errors:** Camoufox/Playwright doesn't support `page.evaluate()` with function arguments the same way Selenium does. The `"evaluate: The operation is insecure"` errors are cosmetic (overlay can't inject scripts) but don't block extraction.

## Bot Health Summary

```
═══════════════════════════════════════
  QUESTAI BOT HEALTH — indeed
═══════════════════════════════════════
🔍 PRE-FLIGHT: Chrome ✅ Mongo ✅ corpus-rag ✅ Git ✅ Session ❌
🧪 TEST JOB: N/A (no jobs in DB, extract-only)
📊 EXTRACT: 1/6 steps reached (login gate)
📊 APPLY: N/A (extract-only mode)
🌿 BRANCH: repair/indeed-2026-05-22 (1 commit)
───────────────────────────────────
SUMMARY: 1 bug found, 1 fixed, 1 needs human (re-login)
First run caught a real type-coercion bug — shakedown working ✅
═══════════════════════════════════════
```
