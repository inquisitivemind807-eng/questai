# Quest Bot (FinalBoss) — AI-Driven Autonomous Job Search & Application Platform

Quest Bot is an advanced, high-performance automation suite designed to transform the job application process from a manual grind into an autonomous, AI-optimized journey. Built on **SvelteKit**, **Tauri**, and **Bun**, it combines high-level AI reasoning with low-level browser automation to help users land their next role with minimal effort.

---

## 🌟 The Vision

Quest Bot isn't just a scraper; it's an **Autonomous Career Agent**. It handles the entire lifecycle of a job search: from finding relevant listings across multiple platforms to tailoring your professional documents and finally submitting applications on your behalf using human-like browser interactions.

---

## 🛠 What This App Does (Core Features)

### 1. Unified Job Intelligence Dashboard
*   **Multi-Platform Tracking**: A centralized "Command Center" for LinkedIn, Seek, and Indeed.
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
*   **Camoufox Integration (Indeed)**: Employs a specialized, hardened Firefox browser for Indeed, spoofing hardware fingerprints and overcoming aggressive stealth protections.
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
  - **Playwright + Camoufox** (Indeed).
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
│   │   ├── indeed/             # Indeed-specific Playwright logic
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
3.  **Camoufox**: `npx camoufox-js fetch` (Required for Indeed bot).

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

All bots are run from the `questai/` directory using Bun. **Exception:** the `indeed` and `indeed_apply` bots must be run with `npx tsx` — not `bun` — because `camoufox-js` internally uses `better-sqlite3`, a native C++ addon compiled for Node.js ABI, which is incompatible with Bun's ABI.

```bash
cd questai

# Seek & LinkedIn — use bun
bun src/bots/bot_starter.ts <bot_name> [options]

# Indeed — use npx tsx (Node.js runtime required)
npx tsx src/bots/bot_starter.ts <bot_name> [options]
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
| `indeed` | Indeed | Extract jobs (search & save) |
| `indeed_extract` | Indeed | Extract jobs only |
| `indeed_apply` | Indeed | Apply to a specific job via `--url=` |
| `indeed_apply_pauseconfirm` | Indeed | Apply with manual confirmation at each step |
| `indeed_extract_pauseconfirm` | Indeed | Extract with manual confirmation at each step |
| `bulk` | Any | Orchestrate applying to a queue of jobs from DB |

---

### 🔍 Extract / Scrape Jobs

```bash
# Seek — extract jobs from search page
bun src/bots/bot_starter.ts seek

# LinkedIn — extract jobs from search page
bun src/bots/bot_starter.ts linkedin

# Indeed — extract jobs from search page (must use npx tsx, not bun)
npx tsx src/bots/bot_starter.ts indeed

# Indeed — extract with manual confirmation
npx tsx src/bots/bot_starter.ts indeed_extract_pauseconfirm
```

---

### 🚀 Direct Apply (Single Job URL)

Pass `--url=` to trigger a direct apply workflow for a specific job listing.

```bash
# Seek — apply to a specific job
bun src/bots/bot_starter.ts seek --url=https://www.seek.com.au/job/12345678

# LinkedIn — apply to a specific job
bun src/bots/bot_starter.ts linkedin --url=https://www.linkedin.com/jobs/view/12345678

# Indeed — apply to a specific job (must use npx tsx, not bun)
npx tsx src/bots/bot_starter.ts indeed_apply --url=https://au.indeed.com/viewjob?jk=abc123

# Indeed — apply with manual confirmation
npx tsx src/bots/bot_starter.ts indeed_apply_pauseconfirm --url=https://au.indeed.com/viewjob?jk=abc123

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

## 🟡 Indeed Bot — Current Status

> Based on [`docs/indeed_minimum_requirements.md`](./docs/indeed_minimum_requirements.md)

The Indeed bot uses **Playwright + Camoufox** (stealthy Firefox) instead of Selenium/Chrome, making it more resilient against Indeed's aggressive anti-bot protections.

| Feature | Status | Notes |
|---|---|---|
| Browser boot (Camoufox) | ✅ Done | Loads persistent session from `sessions/indeed/camoufox_profile/` |
| Login detection | ✅ Done | `openCheckLogin` checks for auth cookies & sign-in button |
| Manual login prompt | ✅ Done | Injects red banner, waits up to 3 mins for cookie-based auth confirmation |
| Job extraction (search) | ✅ Done | Extracts title, company, location, salary, description, saves to DB incrementally |
| Pagination | ✅ Done | `navigateToNextPage` follows next-page links |
| Direct Apply (URL) | ✅ Done | `indeed_apply` bot navigates to URL and attempts Easy Apply |
| Form answering | ⚠️ Stub | Currently just clicks Continue/Submit — no LLM Q&A |
| `userLog` (clean frontend logs) | ❌ Missing | All logging is `console.log` — no user-facing dashboard messages |
| Overlay integration | ✅ Done | `UniversalOverlay` integration completed with job progress updates |
| `indeed_extract_steps.yaml` | ✅ Done | Dedicated extraction workflow YAML |
| `indeed_apply_pauseconfirm` | ✅ Done | Pause-confirm variants for extraction and application |
| Tauri runner fix | ❌ Missing | Tauri spawns Indeed with wrong runtime (`bun` instead of correct path) |
| Frontend bot mapping | ❌ Missing | `JobTrackerBase.svelte` may not correctly map Indeed jobs to `indeed_apply` |

---

## ⚖️ License
MIT - Created with ❤️ for job seekers everywhere.
