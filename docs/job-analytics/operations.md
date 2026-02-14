# Operations: Verification, Failures, Backfill

## Quick verification checklist

1. Run one Seek apply and one LinkedIn Easy Apply.
2. Open Job Analytics list and confirm new rows appear.
3. Open detail view and validate all tabs:
   - Job details populated
   - Resume has text or explicit fallback value
   - Cover letter populated
   - Q&A shows parsed pairs

## Common failure modes

- Missing `platformJobId` / title / company:
  - Recorder skips record creation.
- Missing `qna.json`:
  - Recorder falls back to parsing `qna_response.json`.
- Resume generated but not uploaded:
  - `resume_response.json` still provides text for analytics tab.
- API unavailable:
  - Recorder logs failure and returns `{ ok: false }`; bot run continues.

## Log sources

- Bot runtime logs (terminal output)
- LinkedIn debug log: `src/bots/linkedin/linkedin-debug.log`
- Recorder logs prefixed with `[JobRecorder]`

## Backfill approach (existing local artifacts)

Recommended script behavior:
1. Traverse local job artifact directories.
2. For each job, call `buildJobApplicationPayload(...)`.
3. POST payload through existing recorder API helper.
4. Emit summary: success/failure counts and failed job IDs.

Use backfill after parser/normalization updates to retro-populate old runs.
