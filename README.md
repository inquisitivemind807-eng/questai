# Quest Bot (FinalBoss) — AI-Driven Autonomous Job Search & Application Platform

> ⚠️ **Honest Status: ~60% complete.** This is a work-in-progress. The bots run, but there are known bugs,
> inconsistencies, and missing features. See [Current Project Status](#-current-project-status-real-talk) below.

Quest Bot is an advanced, high-performance automation suite designed to transform the job application process from a manual grind into an autonomous, AI-optimized journey. Built on **SvelteKit**, **Tauri**, and **Bun**, it combines high-level AI reasoning with low-level browser automation to help users land their next role with minimal effort.

---

## 🔴 Current Project Status (Real Talk)

This project is **~60% complete**. Here's the honest breakdown.

### What Actually Works ✅
- **Seek bot**: Most mature. Extract + apply + employer Q&A + cover letters all work.
- **LinkedIn bot**: Extract and basic apply work. Session persistence works. Cover letter generation works.
- **Workflow Engine**: YAML-driven state machine is solid. Retry loops, timeouts, transitions work.
- **Universal Overlay**: Browser overlay injection + heartbeat self-healing works.
- **Bot Dashboard**: Frontend panel shows progress, logs, bot status. `botProgressStore` works.
- **Humanization**: Selenium human-like typing + clicking + scrolling.
- **CLI**: `bot_starter.ts` with full flag support (`--url`, `--mode`, `--limit`, `--jobs`, etc.).
- **Job Application Recorder**: POSTs structured data to the backend API.
- **AI Cover Letters**: Works for Seek and LinkedIn (corpus-rag DeepSeek API).

### What's Broken / Incomplete ❌
- **LinkedIn apply**: LinkedIn recently changed their UI (new job tracker component). Apply selectors may be broken.
- **Overlay/App log inconsistency**: Logs between browser overlay and frontend dashboard sometimes disagree.
- **No human-in-the-loop**: Currently a single-developer project. No Telegram/Slack pings, no manual review queue.
- **No self-healing scrapers**: When platforms change DOM, bots break and need manual code fixes.
- **No test coverage**: Minimal automated tests. Most testing is manual / visual.
- **No JSON exchange bridge**: Tauri doesn't yet write `job_payload.json` for external agent pickup.

### Architecture To-Do 📋
- [ ] Set up OpenClaw/OpenCode agent hierarchy (Manager + Intern agents)
- [ ] Build JSON exchange directory (Tauri → `job_payload.json` → OpenClaw → server Gateway)
- [ ] Add self-healing selector logic for DOM breakage recovery
- [ ] Add human-in-the-loop routing (Slack/Telegram pings for 2FA, CAPTCHAs)
- [ ] Add `highlight()` outline selectors to LinkedIn and Seek bots
- [ ] Standardize logging across all bots (`userLog` vs `console.log`)
- [ ] Comprehensive JSDoc on all source files ✅ (done 2026-05-18)

---

## 🌟 The Vision

Quest Bot isn't just a scraper; it's an **Autonomous Career Agent**. It handles the entire lifecycle of a job search: from finding relevant listings across multiple platforms to tailoring your professional documents and finally submitting applications on your behalf using human-like browser interactions.

---

## 🛠 What This App Does (Core Features)

### 1. Unified Job Intelligence Dashboard
*   **Multi-Platform Tracking**: A centralized "Command Center" for LinkedIn, Seek, and Jora.
*   **Live Progress Monitoring**: Watch bots work in real-time via the **Bot Activity** log and the **Universal Overlay**.
*   **Performance Analytics**: Visual data on your application momentum, including daily/weekly/monthly charts and "Time Saved" metrics.
*   **Job Status Lifecycle**: Track jobs from `Discovered` → `Applied` → `Interview` → `Offer` or `Rejected`.

### 2. Autonomous "Bot Apply" System
*   **Human-Like Interaction**: Bots use randomized mouse movements, realistic typing speeds, and "jitter" to bypass sophisticated anti-bot detection.
*   **Smart Form Filling**: Integrates with the `corpus-rag` AI backend to answer platform-specific application questions (e.g., "How many years of experience do you have with Svelte?").
*   **Autonomous Document Tailoring**: Automatically attaches the most relevant resume and generates a job-specific cover letter for every single application.
*   **Bulk Queueing**: Select up to 10 jobs and fire them off in a single batch.

### 3. AI Document Suite
*   **Resume Builder**: Create and manage multiple versions of your resume.
*   **AI Resume Enhancement**: Upload your resume and let the AI optimize it for specific keywords and ATS (Applicant Tracking System) compatibility.
*   **Tailored Cover Letters**: Instantly generate professional cover letters mapped directly to the job description and your personal profile.

### 4. Advanced Stealth Infrastructure
*   **Selenium Stealth (LinkedIn/Seek)**: Uses a custom humanization layer and Chrome profile management to maintain long-term session persistence.
*   **Session Persistence**: Bots "remember" your logins, so you don't have to solve CAPTCHAs or log in every time.

---

## 🏗 Technical Architecture

### The Stack
- **Frontend**: SvelteKit (UI), TypeScript (Logic), TailwindCSS & DaisyUI (Styling).
- **Desktop Wrapper**: Tauri (Rust) for secure file access, process management, and native performance.
- **Engine**: Bun for high-speed TypeScript execution of bot workflows.
- **Automation**: 
  - **Selenium Webdriver** (Seek/LinkedIn).
- **Backend**: Integrates with the `corpus-rag` API for LLM processing and RAG-based data retrieval.

### The Bot Core (`src/bots/core`)
*   **`WorkflowEngine.ts`**: A robust state machine that reads YAML configurations and executes steps. It handles retries, timeouts, and state transitions.
*   **`UniversalOverlay.ts`**: A Svelte-powered UI injected directly into the automation browser, allowing you to see what the bot is thinking and intervene if needed.
*   **`HumanBehavior.ts`**: The "humanization" engine that makes Selenium look like a real person.
*   **`BotRegistry.ts`**: Automatically discovers new bot variants and implementations in the project directory.

---

## 📂 System Layout

```text
├── src/
│   ├── bots/                   # The Automation Engine
│   │   ├── core/               # Shared logic: Workflow Engine, Stealth, Overlay
│   │   ├── linkedin/           # LinkedIn-specific Selenium logic
│   │   └── seek/               # Seek-specific Selenium logic
│   ├── lib/                    # Svelte logic, stores, and API clients
│   ├── routes/                 # UI Pages (Dashboard, Trackers, Builder)
│   └── tests/                  # Integration and E2E tests
├── sessions/                   # Browser profiles (Login sessions)
├── logs/                       # JSONL logs for every bot run
├── build/                      # Compiled production assets
└── src-tauri/                  # Rust source for the desktop application
```

---

## 🚥 Installation & Setup

### Prerequisites
1.  **Bun**: `curl -fsSL https://bun.sh/install | bash`
2.  **Rust**: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
3.  **Camoufox**: `npx camoufox-js fetch` (Optional; for advanced stealth browser support).

### Setup
1.  **Clone & Install**:
    ```bash
    bun install
    ```
2.  **Environment**:
    Create a `.env` file:
    ```env
    VITE_API_BASE=http://localhost:3000
    PUBLIC_API_BASE=http://localhost:3000
    CORPUS_RAG_TOKEN=your_secure_api_token
    ```
3.  **Launch**:
    ```bash
    bun run tauri:dev
    ```

---

## 🛠 Developer Guide

### Creating a New Bot Variant
To create a new workflow (e.g., a "Quick Apply" for a new platform):
1.  Add a `{platform}_apply_steps.yaml` to `src/bots/{platform}/`.
2.  Implement the generator functions in `{platform}_impl.ts`.
3.  The `BotRegistry` will automatically detect the variant.

### Debugging
*   **Logs**: Check `logs/YYYY-MM-DD/workflow.jsonl` for step-by-step execution data.
*   **Overlay**: The browser overlay shows the current step and any errors encountered during the run.
*   **Headless Mode**: Toggle `headless: false` in `bot_starter.ts` or via the CLI to watch the bot work visually.

### Camoufox Browser zip in our own server (Not done yet!)
If a user downloads a newer browser binary than what your bot scripts expect → things break silently or crash.

✅ Best: Host the exact .zip binary on your server
Pin the version your bot is tested against
In-app installer downloads from your URL (e.g. yourserver.com/camoufox/0.4.x/linux.zip)
You control exactly what gets installed
When you update your bot, you update the hosted binary too

---

## 🖥️ CLI Commands (`bot_starter.ts`)

All bots are run from the `questai/` directory using Bun.

```bash
cd questai
bun src/bots/bot_starter.ts <bot_name> [options]
```

### Available Bot Names

| Bot Name | Platform | Action |
|---|---|---|
| `seek` | Seek | Extract jobs (search & save) |
| `seek_extract` | Seek | Extract jobs only |
| `seek_apply` | Seek | Apply to a specific job via `--url=` |
| `seek_apply_pauseconfirm` | Seek | Apply with manual confirmation at each step |
| `seek_extract_pauseconfirm` | Seek | Extract with manual confirmation at each step |
| `linkedin` | LinkedIn | Extract jobs |
| `linkedin_extract` | LinkedIn | Extract jobs only |
| `linkedin_apply` | LinkedIn | Apply to a specific job via `--url=` |
| `linkedin_apply_pauseconfirm` | LinkedIn | Apply with manual confirmation at each step |
| `linkedin_extract_pauseconfirm` | LinkedIn | Extract with manual confirmation at each step |
| `bulk` | Any | Orchestrate applying to a queue of jobs from DB |

---

### 🔍 Extract / Scrape Jobs

```bash
# Seek — extract jobs from search page
bun src/bots/bot_starter.ts seek

# LinkedIn — extract jobs from search page
bun src/bots/bot_starter.ts linkedin
```

---

### 🚀 Direct Apply (Single Job URL)

Pass `--url=` to trigger a direct apply workflow for a specific job listing.

```bash
# Seek — apply to a specific job
bun src/bots/bot_starter.ts seek --url=https://www.seek.com.au/job/12345678

# LinkedIn — apply to a specific job
bun src/bots/bot_starter.ts linkedin --url=https://www.linkedin.com/jobs/view/12345678

# With a specific bot mode (e.g., 'bot' for fully automated, 'review' to pause before submit)
bun src/bots/bot_starter.ts seek --url=https://www.seek.com.au/job/12345678 --mode=bot
bun src/bots/bot_starter.ts seek --url=https://www.seek.com.au/job/12345678 --mode=review
```

---

### 📦 Bulk Orchestrator

Run a queue of jobs (by DB ObjectId) in sequence. Failed jobs are skipped and the queue continues.

```bash
# Run a list of job IDs in review mode
bun src/bots/bot_starter.ts bulk --jobs=<id1>,<id2>,<id3> --mode=review

# Run in fully automated bot mode
bun src/bots/bot_starter.ts bulk --jobs=<id1>,<id2>,<id3> --mode=bot

# Enable Superbot (forces 'bot' mode globally, overrides per-job mode)
bun src/bots/bot_starter.ts bulk --jobs=<id1>,<id2>,<id3> --superbot=true
```

---

### 🏁 Flags Reference

| Flag | Description | Example |
|---|---|---|
| `--url=<url>` | Direct Apply URL for a specific job listing | `--url=https://seek.com.au/job/123` |
| `--mode=<mode>` | Bot mode: `review` (default, pauses before submit) or `bot` (fully auto) | `--mode=bot` |
| `--limit=<n>` | Max number of jobs to extract/process | `--limit=10` |
| `--headless` | Run browser in headless mode (no visible window) | `--headless` |
| `--keep-open` / `--review` | Keep browser open after workflow completes | `--keep-open` |
| `--jobId=<id>` | Target a specific DB job ID (for tracking applied job) | `--jobId=abc123` |
| `--jobs=<csv>` | *(Bulk only)* Comma-separated DB ObjectIds to process | `--jobs=id1,id2` |
| `--superbot=true` | *(Bulk only)* Force `bot` mode for all jobs in queue | `--superbot=true` |

---

### 🧪 Seek Test Runners

```bash
# Run Seek Quick Apply integration tests
bun src/bots/bot_starter.ts seek test

# Run Seek Quick Apply E2E test
bun src/bots/bot_starter.ts seek quicktest
```

---

### 🌱 Environment Variable Overrides

These env vars (from `.env` or Tauri) take priority over CLI flags:

| Variable | Description |
|---|---|
| `BOT_EXTRACT_LIMIT` | Overrides `--limit=` for max jobs to extract |
| `BOT_ID` | Overrides the auto-generated bot session ID |
| `CORPUS_RAG_TOKEN` | Auth token for the RAG backend API |

---

## 🟠 LinkedIn Bot — Current Status

> ⚠️ LinkedIn recently updated their UI (new job tracker component). Apply selectors may be broken.

The LinkedIn bot uses **Selenium + Chrome** with session persistence via user-data-dir.

| Feature | Status | Notes |
|---|---|---|
| Browser boot (Chrome) | ✅ Done | Persistent session from `sessions/linkedin/` |
| Login detection + manual prompt | ✅ Done | Overlay-based login prompt with cookie detection |
| Job extraction | ✅ Done | Extracts job_id, title, company, location, URL from card list |
| Panel sync verification | ✅ Done | `waitForLinkedInPanelSync` polls URL, data-attributes, aria-current, text match |
| Details extraction | ✅ Done | Extracts full description, job type, applicants count |
| Easy Apply | ⚠️ Fragile | Recent UI changes may break selectors |
| Employer Q&A | ✅ Done | Uses Seek's intelligent Q&A handler + LLM |
| Cover letter generation | ✅ Done | corpus-rag DeepSeek API |
| Resume upload | ✅ Done | Supports AI resume and manual upload paths |
| Outline selectors (`highlight()`) | ❌ Missing | LinkedIn and Seek without colored element outlines |
| `userLog` (clean frontend logs) | ✅ Done | User-facing log messages consistent with Seek |

## 🔮 Planned Architecture (OpenClaw + OpenCode)

The remaining 40% involves building the agent orchestration layer:

```
[ User Machine: Tauri / Svelte ]
       │  (Scrapes Job Data via Chrome/Camoufox)
       ▼
 [ Local OpenClaw Node ] 
       │  (Watches for job_payload.json)
       │  (Asynchronous JSON Payload: Job Data + User Resume)
       ▼
[ Cloud Server: OpenClaw Gateway ] ──> [ DeepSeek Agent ] ──> (Generates Cover Letter)
       │                                                                  │
       └─────────────────── (Returns PDF / Text Output) ──────────────────┘
```

### Key Integration Points
1. **JSON Exchange Directory**: Tauri writes `job_payload.json` to a watched folder. OpenClaw node picks it up.
2. **Server Route**: Server's OpenClaw Gateway accepts payloads, routes to DeepSeek, returns PDFs/text.
3. **Self-Healing Scrapers**: OpenCode watches error logs, auto-fixes broken CSS selectors.
4. **Human-in-the-Loop**: Telegram/Slack pings for 2FA, CAPTCHAs, and manual review.

---

## ⚖️ License
MIT - Created with ❤️ for job seekers everywhere.
