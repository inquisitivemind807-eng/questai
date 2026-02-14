# Flow: Seek/LinkedIn Bot to Job Analytics

## Seek flow

1. Seek bot extracts job metadata and writes job file.
2. Resume/Cover Letter/Q&A handlers write artifacts into job directory.
3. On close/continue step, bot calls `recordJobApplicationToBackend(...)`.
4. Recorder reads artifacts, normalizes payload, POSTs `/api/job-applications`.
5. Job Analytics list/detail APIs return stored application data.
6. Detail page tabs render normalized fields.

Primary hook:
- `src/bots/seek/seek_impl.ts` -> `closeQuickApplyAndContinueSearch`

## LinkedIn flow

1. LinkedIn bot extracts panel details into `jobs/linkedinjobs/<jobId>/job_details.json`.
2. Handlers create `cover_letter_response.json`, `resume_response.json`, `qna_request.json`, `qna_response.json`, and possibly `qna.json`.
3. After submit/save step, bot calls `recordJobApplicationToBackend(...)`.
4. Recorder normalizes data, including Q&A fallback from `qna_response.json`.
5. Job Analytics displays all available tabs using same API contract.

Primary hook:
- `src/bots/linkedin/linkedin_impl.ts` -> `saveAppliedJob`

## Key reliability decisions

- Recording is non-blocking: failure logs warning and bot continues.
- Normalization uses fallback order so partial artifact sets still produce usable analytics records.
- Resume stores full text when available for better tab readability.
- Artifacts write to canonical client folders (`clients/<email_safe>/jobs/...`) with legacy read fallback.
