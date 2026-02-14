# Bot Logging Standard

This document defines the structured logging format for bot runs in `finalboss`.

## Goals

- Capture API calls, workflow transitions, auth state, and errors in machine-readable logs.
- Keep logs safe to share with AI by redacting secrets.
- Keep bot behavior non-blocking even if logging fails.

## Log Output

Logs are written as JSON Lines in:

- `logs/YYYY-MM-DD/api.jsonl`
- `logs/YYYY-MM-DD/workflow.jsonl`
- `logs/YYYY-MM-DD/error.jsonl`
- `logs/YYYY-MM-DD/auth.jsonl`

Each line is one JSON object.

## Entry Schema

Core fields:

- `timestamp`
- `level` (`debug|info|warn|error`)
- `service` (`finalboss-bot`)
- `event`
- `message`
- `sessionId`
- `botName`
- `platform`
- `jobId`
- `data` (structured payload)

## Redaction Rules

Any keys containing:

- `authorization`
- `token`
- `cookie`
- `password`
- `secret`

are masked automatically before writing to file.

## Correlation

- `sessionId` identifies a single bot run.
- API calls include a generated `requestId` to correlate request/response/error.

## Bundling Logs for AI

Create a bundle file:

```bash
npm run logs:bundle -- --date 2026-02-14
npm run logs:bundle -- --date 2026-02-14 --session seek_1739500000000_ab12cd34
```

Output goes to `logs/bundles/` and is ready to share for debugging.

## Live Tailing During Runs

Watch logs in real time:

```bash
npm run logs:tail
npm run logs:tail -- --category api
npm run logs:tail -- --session seek_1739500000000_ab12cd34
npm run logs:tail -- --date 2026-02-14 --category error
```

Options:

- `--date YYYY-MM-DD` (default: local today)
- `--category api|workflow|error|auth`
- `--session <sessionId>`
- `--no-pretty` (raw JSON output)
