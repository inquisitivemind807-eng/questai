# Self-Healing Persistent Overlay System

The overlay currently follows "Navigate → Wait for content → Show UI". This plan reverses it to "Show UI → Navigate → Update UI" by making the overlay self-healing and moving its initialization to right after driver creation.

## Proposed Changes

### Core Overlay Engine

#### [MODIFY] [universal_overlay.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/core/universal_overlay.ts)

**1. Add a Node.js heartbeat loop** that runs every ~3 seconds. On each tick it:
- Calls `driver.executeScript` to check if `window.__overlaySystemInitialized` exists
- If missing (page navigated and destroyed the JS context), calls [injectPersistentOverlaySystem()](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/core/universal_overlay.ts#73-755) to reinject
- This ensures the overlay reappears after *any* navigation, without the bot logic needing to request it

**2. Eagerly initialize on construction**: Change [initialize()](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/core/universal_overlay.ts#53-72) to be called automatically when construction is complete (fire-and-forget). The `initialized` flag resets to `false` whenever the heartbeat detects the browser context was lost, so the next heartbeat reinjects.

**3. Remove lazy `await this.initialize()` calls** inside [showJobProgress](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/core/universal_overlay.ts#801-834), [updateJobProgress](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/core/universal_overlay.ts#871-910), [showOverlay](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/core/universal_overlay.ts#1051-1084), [showNotification](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/core/universal_overlay.ts#1196-1226). The heartbeat handles reinjection now — these methods just call [updateState](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/core/universal_overlay.ts#775-800) which itself will reinject if needed via the existing guard in [updateState](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/core/universal_overlay.ts#775-800) (lines 789–792).

**4. Harden the browser-side navigation watcher**: Inside [injectPersistentOverlaySystem](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/core/universal_overlay.ts#73-755), enhance `setupNavigationWatcher` to also listen for [load](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/linkedin/linkedin_impl.ts#2051-2121) and `DOMContentLoaded` events (in addition to the existing `MutationObserver` + `popstate` + `pushState/replaceState` hooks). On these events, call `ensureOverlayPresent()` immediately (no 300ms delay). Reduce the existing 300ms setTimeout delays in the pushState/replaceState/popstate handlers to 50ms.

---

### Bot Implementations

#### [MODIFY] [linkedin_impl.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/linkedin/linkedin_impl.ts)

In [openCheckLogin](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/linkedin/linkedin_impl.ts#365-428) (line 376), immediately after `ctx.overlay = new UniversalOverlay(driver, 'LinkedIn')`, add:
```ts
await ctx.overlay.initialize();
await ctx.overlay.showJobProgress(0, 0, "Starting LinkedIn bot...", 0);
```
This makes the overlay visible the moment the browser opens, before any navigation.

In [openJobsPage](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/linkedin/linkedin_impl.ts#452-512) (line 503), keep the existing [showJobProgress](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/core/universal_overlay.ts#801-834) call but it now just *updates* an already-visible overlay instead of being the first time it appears.

#### [MODIFY] [seek_impl.ts](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/seek/seek_impl.ts)

Same pattern — at lines 283, 376, and 2025 where `ctx.overlay = new UniversalOverlay(...)` is called, immediately follow with [initialize()](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/core/universal_overlay.ts#53-72) + [showJobProgress(0, 0, "Starting Seek bot...", 0)](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/core/universal_overlay.ts#801-834).

---

## Verification Plan

### Manual Verification

There are no existing automated tests for the overlay system. Since the overlay is a visual browser-side component injected via Selenium, manual testing is required.

> [!IMPORTANT]
> I need your guidance here — how do you typically test-run the bot? Do you run `npm run dev` and trigger a bot from the dashboard, or do you have a standalone script? Please let me know and I'll tailor the verification steps.

**Expected behavior after changes:**
1. Overlay appears within 1–2 seconds of the browser window opening (before any LinkedIn/Seek page loads)
2. When the bot navigates to a new page, the overlay briefly disappears then reappears within 3 seconds (heartbeat interval)
3. The browser-side `DOMContentLoaded`/[load](file:///home/wagle/inquisitive_mind/jobapps/questai/src/bots/linkedin/linkedin_impl.ts#2051-2121) listeners should reinject even faster (sub-100ms)
4. All existing overlay features (collapse, expand, drag, logs, sign-in prompt) continue working
