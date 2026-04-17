# Bot Architecture Report

This document provides a summary of the bot automation system located in `src/bots/`.

## File Summaries

### Entry Point & Orchestration
- **`bot_starter.ts`**: The main CLI entry point that initializes the environment, handles signals (SIGINT/SIGTERM), and kicks off bot execution via `BotStarter`. It supports single-bot runs, bulk job orchestration, and interactive bot selection.
- **`core/registry.ts`**: Discovers available bots and their workflow variants by scanning the `src/bots/` directory for `*_steps.yaml` files. It manages bot metadata, configurations, and selectors, acting as a central catalog for the system.

### Workflow Engine
- **`core/workflow_engine.ts`**: The core state machine that parses YAML workflow definitions and executes them step-by-step. It handles transitions based on step outcomes, manages retries, timeouts, and maintains the shared `WorkflowContext`.
- **`core/pause_confirm.ts`**: Implements the "pause-and-confirm" logic, allowing the workflow to wait for manual user intervention via the browser overlay.

### Browser & Interaction
- **`core/browser_manager.ts`**: Manages browser lifecycles (Chrome/Selenium and Playwright/Camoufox), including process cleanup and driver initialization.
- **`core/humanization.ts`**: Provides utilities for simulating human-like behavior, such as randomized delays, mouse movements, and realistic typing to evade anti-bot detection.
- **`core/universal_overlay.ts`**: A sophisticated Svelte-powered UI injected directly into the target browser. It provides real-time status updates, progress bars, and interactive elements to the user.

### Data & Infrastructure
- **`core/api_client.ts`**: A shared client for communicating with the `corpus-rag` backend API, handling authentication and standardized requests.
- **`core/logger.ts`**: Implements a structured JSONL logging system that tracks bot events, errors, and performance metrics across sessions.
- **`core/sessionManager.ts`**: Handles browser session persistence, allowing bots to reuse cookies and local storage to stay logged into platforms.
- **`core/job_application_recorder.ts`**: Records application results and job details into the database, ensuring a persistent history of bot activities.
- **`core/config_loader.ts`**: Helper for loading bot-specific and global configurations.
- **`core/client_paths.ts`**: Centralizes path resolution for logs, sessions, and other dynamic data directories.

### Platform Implementations
- **`indeed/`, `linkedin/`, `seek/`**: Contain platform-specific implementations. Each folder typically includes a `{platform}_impl.ts` (step functions) and various `*_steps.yaml` files (workflow definitions).

---

## Architectural Overview

### Execution Model: YAML-Driven State Machine
The system follows a **declarative workflow model**. Automation logic is defined in **YAML files** as a sequence of named steps. Each step points to a **TypeScript function** (the "step function") defined in a platform implementation file.

1. **Parsing:** The `WorkflowEngine` loads the YAML and identifies the `start_step`.
2. **Execution:** It invokes the registered TypeScript function for the current step.
3. **Branching & Conditionals:** Step functions are `AsyncGenerators` that yield a "transition event" string (e.g., `success`, `retry`, `found`, `not_found`). The engine uses this string to look up the next step in the YAML's `transitions` map.
4. **Retries:** Steps can define `max_retries` and `on_max_retries` fallbacks directly in the YAML.
5. **Context:** A shared `WorkflowContext` object is passed between all steps, allowing data (like job URLs or selectors) to persist throughout the run.

### The Lifecycle of a Bot Run
1. **Initiation:** `bot_starter.ts` receives a bot name (e.g., `seek_apply`).
2. **Discovery:** `BotRegistry` finds the corresponding YAML and implementation files.
3. **Setup:** `BotStarter` loads the configuration, initializes the `WorkflowEngine`, and registers the implementation's step functions.
4. **Running:** The `WorkflowEngine` executes the state machine until it reaches a `done` state or encounters a fatal error.
5. **Human-in-the-loop:** At any point, the `UniversalOverlay` can display status or use `pause_confirm.ts` to wait for user approval before continuing sensitive steps (like submitting an application).

### Core Philosophy: Stealth & Resilience
The architecture prioritizes **stealth** (via `humanization.ts` and `browser_manager.ts`) and **resilience** (via structured workflows and error recovery). By decoupling the "what" (YAML) from the "how" (TypeScript), the system remains highly maintainable and easily extensible to new job platforms.


Show me the following, with actual code samples:

A complete step function from platform impl (e.g. seek_impl.ts) — the full AsyncGenerator signature, how it receives WorkflowContext, what it yields, and how it detects completion (DOM checks, keyword matching, selector presence).
A complete *_steps.yaml example — show a real workflow with at least one branching transition, a retry, and a done state.
How step functions are registered with the WorkflowEngine — the exact call that maps a YAML step name to a TypeScript function.
What WorkflowContext looks like — the type definition and what data typically lives on it during a run.

No explanations, just the raw code.