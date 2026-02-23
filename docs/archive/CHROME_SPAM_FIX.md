# Chrome Instance Spam Fix - Summary

## Problem
The seek bot was spawning 46+ Chrome instances on slow machines with slow internet, causing system freezes.

## Root Causes
1. **Infinite retry loops** without max retry limits
2. **Browser instance recreation** on every `open_homepage` call
3. **Retry loop:** `refresh_page → open_homepage → new Chrome instance`
4. **No cleanup handlers** for runaway processes
5. **Timeouts too short** for slow machines/networks

## Fixes Applied

### 1. Browser Instance Guard ✅
**File:** `src/bots/seek/seek_impl.ts:60-80`

Added check to prevent multiple Chrome spawns:
```typescript
if (ctx.driver) {
  printLog("⚠️ Browser already exists, reusing existing instance");
  // Reuse existing browser instead of creating new one
  ...
}
```

### 2. Retry Counters ✅
**File:** `src/bots/seek/seek_impl.ts:47-67`

Added retry limits to prevent infinite loops:
```typescript
ctx.retry_counts = {
  page_load_retries: 0,
  refresh_retries: 0,
  collect_cards_retries: 0,
  MAX_PAGE_LOAD_RETRIES: 3,
  MAX_REFRESH_RETRIES: 2,
  MAX_COLLECT_CARDS_RETRIES: 5
};
```

**Modified functions:**
- `waitForPageLoad()` - max 3 retries
- `refreshPage()` - max 2 retries
- `collectJobCards()` - max 5 retries

### 3. YAML Workflow Fixes ✅
**File:** `src/bots/seek/seek_steps.yaml`

**Changed:**
- `refresh_page → page_reload_failed` now loops to `refresh_page` (NOT `open_homepage`)
- Added permanent failure states:
  - `page_load_failed_permanently → done`
  - `refresh_failed_permanently → done`
  - `no_cards_found_permanently → done`

**Before:**
```yaml
refresh_page:
  transitions:
    page_reload_failed: "open_homepage"  # ❌ Creates NEW browser!
```

**After:**
```yaml
refresh_page:
  transitions:
    page_reload_failed: "refresh_page"  # ✅ Retries refresh (with limit)
    refresh_failed_permanently: "done"  # ✅ Gives up gracefully
```

### 4. Increased Timeouts ✅
**File:** `src/bots/seek/seek_steps.yaml`

Doubled timeouts for slow machines:
- `open_homepage`: 30s → **60s**
- `wait_for_load`: 20s → **40s**
- `refresh_page`: 30s → **60s**
- `collect_job_cards`: 30s → **45s**

### 5. Emergency Cleanup Handler ✅
**File:** `src/bots/core/browser_manager.ts:48-82`

Added `killAllChromeProcesses()` function:
- Kills all Chrome/Chromium processes on Linux/Mac/Windows
- Called on SIGINT (Ctrl+C), SIGTERM, uncaught exceptions

**File:** `src/bots/bot_starter.ts:35-60`

Added signal handlers:
```typescript
process.on('SIGINT', () => emergencyCleanup('SIGINT (Ctrl+C)'));
process.on('SIGTERM', () => emergencyCleanup('SIGTERM'));
process.on('uncaughtException', async (error) => { ... });
process.on('unhandledRejection', async (reason) => { ... });
```

### 6. Emergency Cleanup Script ✅
**File:** `kill_chrome.sh`

Created executable script for manual cleanup:
```bash
./kill_chrome.sh
```

Kills all Chrome instances when the bot goes haywire.

## How to Use

### Normal Usage
```bash
cd finalboss
bun bot_starter.ts seek
```

The bot will now:
- ✅ Reuse the same Chrome instance
- ✅ Retry with limits (won't loop forever)
- ✅ Give up gracefully after max retries
- ✅ Wait longer on slow connections
- ✅ Clean up on Ctrl+C

### Emergency Cleanup (If Already Stuck)
```bash
./kill_chrome.sh
```

Or manually:
```bash
# Linux/Mac
pkill -9 chrome

# Windows
taskkill /F /IM chrome.exe /T
```

## Monitoring

Watch for these log messages:

✅ **Good:**
```
⚠️ Browser already exists, reusing existing instance
⚠️ Page load retry 1/3
✅ Found 25 job cards
```

❌ **Bad (shouldn't see anymore):**
```
Opening URL: ... (repeated 20+ times)
🔥 EMERGENCY: Killing all Chrome processes
```

## Files Modified

1. `src/bots/seek/seek_impl.ts` - Browser guard, retry counters
2. `src/bots/seek/seek_steps.yaml` - Workflow transitions, timeouts
3. `src/bots/core/browser_manager.ts` - Emergency cleanup function
4. `src/bots/bot_starter.ts` - Signal handlers
5. `kill_chrome.sh` - Emergency cleanup script (new)

## Performance Impact

- **Before:** Could spawn 46+ Chrome instances, freeze system
- **After:** Max 1 Chrome instance, graceful failure after 3-5 retries
- **Slow machine tolerance:** 2x longer timeouts (60s instead of 30s)
