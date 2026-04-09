# Indeed Bot: Minimum Requirements & Action Plan

Date: April 8, 2026

This document outlines the minimum requirements to bring the Indeed bot (Playwright/Camoufox) up to the standard of the Seek bot (Selenium/Chrome), based on the current implementation gaps.

## 1. What the Seek Bot Does (The "Minimum" Standard)
*   **Login Detection First:** Before doing any work, it checks if there’s an active session. If not, it pauses the workflow, injects a red banner UI, and waits for manual login.
*   **Clean Bot Logging (`userLog`):** It differentiates between internal dev logs (`console.log` / `printLog`) and user-facing logs (`userLog`). `userLog` pushes clean, simple updates directly to the frontend Bot Dashboard (e.g., `"🔍 Searching: Software Engineer"`, `"✅ Found 15 jobs"`, `"📋 Job Title — Company ✅ Saved"`).
*   **Universal Overlay Integration:** It injects a persistent `UniversalOverlay` into the browser. This allows the bot to communicate its current status (e.g., "Extracting jobs...", "Answering questions...") and gives the user buttons to pause, skip, or resume.
*   **Separation of Workflows via YAML:** Seek has distinct YAML workflows for different intents:
    *   `seek_extract_steps.yaml` (Search and save jobs only)
    *   `seek_apply_steps.yaml` (Directly apply to a specific job)
    *   `*_pauseconfirm_steps.yaml` (Variants that pause at critical steps for manual intervention).

---

## 2. What the Indeed Bot Needs

### A. Split and Align the YAML Workflows
Currently, the Indeed bot has `indeed_steps.yaml` and `indeed_apply_steps.yaml`. This needs to be aligned with the Seek bot structure:
1.  **`indeed_extract_steps.yaml`**: Dedicated purely to running a search, iterating over the job cards, and saving the job data.
2.  **`indeed_apply_steps.yaml`**: Dedicated to taking a specific job URL, navigating to it, and running the application flow.
3.  *(Optional but recommended)*: Add `indeed_apply_pauseconfirm_steps.yaml` for step-through mode.

### B. Implement Clean User Logging
`indeed_impl.ts` currently uses `console.log` for everything.
*   **Action:** Create a simple `userLog(message: string)` function at the top of `indeed_impl.ts` that sends clean, user-facing messages to the dashboard. Replace relevant `console.log` calls with `userLog`.

### C. Robust Login Detection
The stubs for `openCheckLogin` and `showManualLoginPrompt` exist in `indeed_impl.ts`.
*   **Action:** Wire these up as the very first steps in **both** the Extract and Apply YAMLs. If no active session is detected, trigger the `UniversalOverlay` (or banner) to prompt for login, pause the execution, and wait.

### D. Fix the Question Answering Stub
The current Q&A logic (`answerQuestions`) simply clicks "Continue" or "Submit".
*   **Action:** If LLM integration is not immediately added, update the logic to pause and use the `UniversalOverlay` to inform the user: *"Manual input required for questions. Click 'Continue' in the overlay when done."*

### E. Fix Infrastructure & Frontend Bugs
*   **Tauri Runner (`src-tauri/src/lib.rs`):** Direct applies using the Indeed bot fail because Tauri tries to run them with `bun` instead of `npx tsx` (which is required for `better-sqlite3` to work with this setup). Update the runner logic.
*   **Frontend Mapping (`JobTrackerBase.svelte`):** Ensure that clicking "Bot Apply" for an Indeed job triggers the `indeed_apply` bot, not `indeed`.
