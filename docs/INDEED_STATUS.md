# Indeed Bot Status Report & Action Plan

Date: April 8, 2026
Status: **Partially Integrated / Infrastructure Blocked**

## 1. Current Status

The Indeed bot has been migrated from a standalone tool into the core `WorkflowEngine` architecture, but it currently faces several technical and structural issues that prevent it from being "Seek-level" robust.

### Key Technical Findings:
*   **Infrastructure Mismatch:** Unlike Seek and LinkedIn (which use Selenium/Chrome), the Indeed bot uses **Playwright/Camoufox (Firefox-based)** for superior anti-bot evasion.
*   **Missing Binaries:** The bot is currently failing to launch because the Camoufox browser binaries are missing from the system. (Error: `Version information not found at /home/wagle/.cache/camoufox/version.json`).
*   **Runtime Discrepancy:** 
    *   Tauri's `run_bot_streaming` (extraction) uses `npx tsx` to handle `better-sqlite3` Node ABI requirements.
    *   Tauri's `run_bot_for_job` (direct apply) incorrectly uses `bun`, which likely causes runtime crashes for Indeed.
*   **Workflow Gaps:** 
    *   The `answerQuestions` implementation is a stub. It simply clicks "Continue" or "Submit" without actually processing form questions via RAG or LLM logic.
    *   It lacks the `HumanBehavior` (randomized mouse/typing) layer that Seek and LinkedIn use.
    *   The `_pauseconfirm` variant does not exist for Indeed.

### Frontend Bugs:
*   **Mapping Error:** In `JobTrackerBase.svelte`, clicking "Bot Apply" for an Indeed job triggers the `indeed` bot (extraction) instead of the `indeed_apply` bot (application).

---

## 2. Architecture Comparison

| Feature | Seek / LinkedIn | Indeed |
| :--- | :--- | :--- |
| **Driver** | Selenium (Chrome) | Playwright / Camoufox (Firefox) |
| **Stealth** | Manual `HumanBehavior` | Native Camoufox Fingerprinting |
| **Q&A Logic** | RAG + LLM Integration | "Click-through" Stub |
| **Runtime** | Bun | npx tsx (Required for SQLite) |
| **Stability** | High | Low (Infrastructure dependent) |

---

## 3. What's Next? (Immediate Action Plan)

To get the Indeed bot working reliably within a few hours, we should follow these steps:

### Phase 1: Infrastructure & Runtime (1 Hour)
1.  **Install Binaries:** Run `npx camoufox-js fetch` to download the required stealth browser.
2.  **Fix Tauri Command:** Update `run_bot_for_job` in `src-tauri/src/lib.rs` to use `npx tsx` when the bot name starts with "indeed", matching the `run_bot_streaming` logic.

### Phase 2: Frontend & Mapping (30 Mins)
1.  **Correct Mappings:** Update `JobTrackerBase.svelte` to map `indeed` to `indeed_apply` when triggering an application.
2.  **Add Pause Variant:** Create `indeed_apply_pauseconfirm_steps.yaml` to allow the "Step-Through" mode requested by the user.

### Phase 3: Logic & Reliability (2-3 Hours)
1.  **Basic Humanization:** Port simple delays and mouse jitter from `HumanBehavior` to the `PlaywrightDriverAdapter` in `indeed_impl.ts`.
2.  **Question Handling:** Update `answerQuestions` in `indeed_impl.ts` to at least detect if it's stuck on a required question and notify the user via the `UniversalOverlay`.
3.  **API Cleanup:** Replace hardcoded `localhost:3000` endpoints in `indeed_impl.ts` with the project-standard `api_client` or environment variables.

---

## 4. Conclusion
The Indeed bot is "integrated" in name only. It uses a different engine (Playwright) and is currently broken by missing system dependencies and incorrect runtime invocation. By aligning the Tauri runner and the frontend mappings, we can get it "working," but it will require a few more hours of logic porting to reach the same quality as the Seek bot.
