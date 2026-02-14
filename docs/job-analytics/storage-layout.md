# Storage Layout

## Canonical client folder layout

All Seek/LinkedIn bot artifacts are stored under client folders keyed by email:

```text
clients/
  <email_safe>/
    jobs/
      seek/
        <jobId>/
          job_details.json
          cover_letter_request.json
          cover_letter_response.json
          resume_request.json
          resume_response.json
          resume.txt
          resume.docx
          resume.pdf
          qna_request.json
          qna_response.json
          qna.json
      linkedin/
        <jobId>/
          ...
```

`<email_safe>` uses lowercase and filename-safe normalization (`@` => `_at_`).

## Fallback compatibility

During migration, readers still support legacy locations:

- LinkedIn legacy: `jobs/linkedinjobs/<jobId>/...`
- Seek legacy: `src/bots/jobs/<jobId>/...`

Writers now prefer canonical client folders when email is available.
