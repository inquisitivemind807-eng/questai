# Job Analytics Integration Docs

This folder is the operational documentation for how Seek/LinkedIn bot runs become records in Job Analytics tabs.

## Scope

- Source system: `finalboss` bot artifacts under local `jobs/` folders.
- Transport: `POST /api/job-applications` via `apiRequest`.
- Destination: backend job application record consumed by:
  - `GET /api/job-applications`
  - `GET /api/job-applications/:id`
- UI: `finalboss/src/routes/job-analytics/+page.svelte` and `finalboss/src/routes/job-analytics/[id]/+page.svelte`.

## Document Index

- `data-contract.md` - canonical artifact and payload mapping.
- `artifact-contract.md` - detailed artifact schemas used by bot writers/readers.
- `storage-layout.md` - client-folder layout and path rules.
- `flow-seek-linkedin.md` - lifecycle from bot steps to analytics tabs.
- `qa-rendering-spec.md` - Q&A tab question/options/answer rendering contract.
- `migration-and-backfill.md` - legacy-to-canonical migration strategy.
- `operations.md` - retries, failures, verification, and backfill guidance.

## Design Notes

- Recorder logic is centralized in `src/bots/core/job_application_recorder.ts`.
- Q&A normalization prioritizes `qna.json` and falls back to parsing `qna_response.json`.
- Resume normalization prioritizes generated text for readable analytics, then falls back to file references.
- The integration is best-effort: recorder failures should not break bot execution.
