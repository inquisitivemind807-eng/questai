# Migration And Backfill

## Objective

Move from legacy artifact folders to canonical client folders without breaking existing data reads.

## Strategy

1. **Writers first**: new bot runs write to `clients/<email_safe>/jobs/<platform>/<jobId>/...`.
2. **Readers with fallback**: recorder reads both canonical and legacy paths.
3. **Backfill optional**: historical records can be re-posted from legacy artifacts.

## Legacy paths supported

- LinkedIn: `jobs/linkedinjobs/<jobId>/...`
- Seek: `src/bots/jobs/<jobId>/...`

## Suggested backfill flow

1. Enumerate legacy job IDs/folders.
2. Resolve `jobFilePath` and `jobDirPath`.
3. Build payload via recorder normalization.
4. POST to `/api/job-applications` (upsert semantics prevent duplication).
5. Log successes/failures and rerun failed subset.
