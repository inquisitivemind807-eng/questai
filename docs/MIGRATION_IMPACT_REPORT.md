# Migration Impact Report: Selenium (TS) to Playwright/Camoufox (Python)

This report outlines the technical scope, affected files, and architectural changes required to migrate the browser automation from Selenium (TypeScript) to Playwright/Camoufox (Python).

## 1. Core Automation Logic (The "Heavy Lift")
The following files contain the bulk of the automation logic and must be entirely rewritten in Python. They rely heavily on Selenium's `WebDriver`, `By`, and `until` APIs.

| File Path | Estimated LOC | Complexity | Description |
|-----------|---------------|------------|-------------|
| `src/bots/linkedin/linkedin_impl.ts` | ~2,800 | Very High | Main LinkedIn extraction and application workflow. |
| `src/bots/seek/seek_impl.ts` | ~2,810 | Very High | Main Seek.com.au automation logic. |
| `src/bots/seek/handlers/answer_employer_questions.ts` | ~1,200 | High | Complex form-filling logic for diverse question types. |
| `src/bots/seek/handlers/resume_handler.ts` | ~400 | Medium | File upload and resume selection logic. |
| `src/bots/seek/handlers/cover_letter_handler.ts` | ~300 | Medium | AI-driven cover letter generation and injection. |

## 2. Shared Infrastructure & Browser Management
These utilities provide the foundation for the bots and will require Python equivalents (e.g., a new `src/bots/core_py/` directory).

*   **Browser Management (`src/bots/core/browser_manager.ts`):** Manages Chrome instance spawning, user profiles, and stealth flags.
*   **Session Management (`src/bots/core/sessionManager.ts`):** Handles cookie persistence and login state verification.
*   **Stealth & Humanization (`src/bots/core/humanization.ts`):** Implements manual CDP-based stealth. While Camoufox handles this natively, the logic for randomized mouse movements and delays needs porting.
*   **Universal Overlay (`src/bots/core/universal_overlay.ts`):** A ~1,300-line utility that injects a persistent Svelte/HTML UI into the browser. **This is a high-risk migration item** as it involves complex `executeScript` operations to maintain a "self-healing" UI across page navigations.

## 3. System Integration & Lifecycle
The migration affects how the Tauri desktop application starts and communicates with the bots.

*   **Tauri Integration (`src-tauri/src/lib.rs`):** The `run_bot_streaming` command is hardcoded to execute `bun src/bots/bot_starter.ts`. This must be updated to support `python` execution and handle environment setups (e.g., virtual environments).
*   **Workflow Orchestration (`src/bots/core/workflow_engine.ts`):** The engine currently expects TypeScript `AsyncGenerator` functions for steps. A Python equivalent must be built to parse the existing YAML step configurations.
*   **Bot Registry (`src/bots/core/registry.ts`):** Discovery logic must be updated to recognize Python-based bot directories (similar to the existing `indeed_bot` structure).
*   **Backend API Client (`src/bots/core/api_client.ts`):** Shared logic for recording successful applications and fetching AI answers must be ported to a Python `api_client.py`.

## 4. Hardest Components to Migrate
1.  **Universal Overlay:** Maintaining the interactive UI overlay within a Python-controlled browser context while ensuring it survives full-page refreshes.
2.  **Form Edge-Cases:** The existing TS implementations handle hundreds of unique Seek/LinkedIn form variations (radio buttons, multi-selects, nested iframes). Capturing this "tribal knowledge" in a rewrite is the primary risk.
3.  **Session Migration:** Transitioning existing Chrome user profiles (Selenium) to Playwright `storageState` or Camoufox-native profile formats.

## 5. Scope Estimation
*   **Total Files Impacted:** ~25-30 files across core and bot-specific directories.
*   **Code Volume:** Approximately **8,000–10,000 lines of TypeScript** need to be rewritten or ported to Python.
*   **Timeline Impact:** This represents a near-total rewrite of the bot execution layer.

## 6. Dependency Changes
*   **Remove (package.json):** `selenium-webdriver`, `@types/selenium-webdriver`.
*   **Add (requirements.txt):** `playwright`, `camoufox`, `pyyaml`, `httpx` (for async API calls).
