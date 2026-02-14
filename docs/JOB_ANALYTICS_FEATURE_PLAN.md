# Job Analytics Feature – Plan & Design (MongoDB + corpus-rag)

> Operational docs for ongoing implementation and research now live in `docs/job-analytics/`:
> - `README.md`
> - `data-contract.md`
> - `flow-seek-linkedin.md`
> - `operations.md`

## Principles

- **Loosely coupled:** finalboss only calls corpus-rag REST APIs; no shared DB or schema. corpus-rag owns MongoDB and the Job model.
- **Elastic:** Same API works for one or many applications; list/detail scale with existing MongoDB indexes.
- **Industry standard:** REST, JSON, Bearer JWT, standard HTTP status codes, clear request/response contracts.

---

## 1. Architecture

```
┌─────────────────┐                    REST (JSON + JWT)                    ┌─────────────────┐
│   finalboss     │  POST /api/job-applications   (record one application)  │   corpus-rag    │
│   (Seek bot)    │ ──────────────────────────────────────────────────────►│   (backend)     │
│                 │  GET  /api/job-applications   (list)                    │                 │
│                 │  GET  /api/job-applications/:id (detail)                │   MongoDB       │
│                 │ ◄────────────────────────────────────────────────────── │   jobs          │
└─────────────────┘                    Authorization: Bearer <JWT>         └─────────────────┘
```

- **finalboss:** After each successful Seek Quick Apply, builds a payload from local files (job JSON + jobDir) and `POST`s to corpus-rag. Uses existing `apiRequest()` + JWT (session-to-jwt / refresh). No MongoDB dependency.
- **corpus-rag:** Exposes job-applications API; resolves `userId` from JWT; upserts into `jobs` collection (existing Job model + optional extended fields). Job Analytics UI in corpus-rag (or finalboss) consumes the same API.

---

## 2. Data Captured (Contract)

| Field | Source (finalboss) | Stored (corpus-rag Job) |
|-------|--------------------|--------------------------|
| Job title | job JSON `title` | `title` |
| Company | job JSON `company` | `company` |
| Job URL | job JSON `url` | `url` |
| Job description | job JSON `details` | `description` |
| Location | job JSON `location` | `location` |
| Salary note | job JSON `salary_note` / `category` | `salary` |
| Work type | job JSON `work_type` | `jobType` |
| Platform job ID | job JSON `jobId` | `platformJobId` |
| Platform | `"seek"` | `platform` |
| Cover letter (final text) | `jobs/{jobId}/cover_letter_response.json` → `cover_letter` | `application.coverLetter` |
| Resume (path or ref) | `jobs/{jobId}/` paths | `application.tailoredResume` or `rawData.resumePaths` |
| Questions & answers | `jobs/{jobId}/qna.json` | `application.questionAnswers` |
| Applied at | bot timestamp | `application.appliedAt`, `lastUpdatedAt` |
| Phase 2: skills / experience / HR contact | Parse from description or page | Optional fields or `rawData` |

---

## 3. API Contract (corpus-rag)

### 3.1 Record application (upsert)

- **Method/URL:** `POST /api/job-applications`
- **Auth:** `Authorization: Bearer <JWT>` (required). `userId` derived from token.
- **Request body (application/json):**

```json
{
  "platform": "seek",
  "platformJobId": "89828381",
  "title": "Senior Software Engineer",
  "company": "Bluefin Resources Pty Limited",
  "url": "https://www.seek.com.au/...",
  "description": "Full job description text...",
  "location": "Sydney NSW",
  "salary": "$175,000 + Super + Bonus",
  "jobType": "Full time",
  "application": {
    "coverLetter": "Full cover letter text...",
    "tailoredResume": "Path or inline ref (e.g. resume path)",
    "questionAnswers": [
      { "question": "Years of experience?", "answer": "5+ years" }
    ]
  },
  "source": { "jobFile": "...", "jobDir": "89828381" }
}
```

- **Response:** `201 Created` or `200 OK` (upsert). Body: `{ "success": true, "id": "<mongo _id>", "platformJobId": "..." }`.
- **Idempotency:** Upsert by `(userId, platform, platformJobId)`. Repeated POST updates the same job document.

### 3.2 List applications

- **Method/URL:** `GET /api/job-applications?platform=seek&status=applied&from=...&to=...`
- **Auth:** Bearer JWT.
- **Response:** `200 OK`. Body: `{ "success": true, "data": [ { "_id", "platform", "platformJobId", "title", "company", "url", "application": { "appliedAt", "status" }, ... } ] }`.

### 3.3 Get one application (detail)

- **Method/URL:** `GET /api/job-applications/:id`
- **Auth:** Bearer JWT. Must own the job.
- **Response:** `200 OK` with full job + application (description, coverLetter, questionAnswers, etc.) or `404 Not Found`.

---

## 4. corpus-rag Implementation

- **Job model:** Already has `title`, `company`, `url`, `description`, `location`, `salary`, `jobType`, `platform`, `platformJobId`, `application: { coverLetter, tailoredResume, questionAnswers, appliedAt, ... }`. Optional: add `rawData.source`, `rawData.skillsRequired`, `rawData.contact*` for Phase 2.
- **JobModel:** Add `upsertJobApplication(userId, payload)` that:
  - Finds by `userId`, `platform`, `platformJobId`; if exists, updates (merge job + application); else inserts. Returns job document.
- **Routes:**
  - `POST /api/job-applications` – parse body, validate, get userId from JWT, call `upsertJobApplication`, return 201/200 + id.
  - `GET /api/job-applications` – get userId from JWT, query jobs with filters, return list.
  - `GET /api/job-applications/[id]` – get userId, find by _id, ensure ownership, return full document.

Use existing auth middleware (JWT); no new DB technology.

---

## 5. finalboss Implementation

- **Recorder (loosely coupled):** New module e.g. `src/bots/core/job_application_recorder.ts` (or under `lib/`). It:
  - Accepts `{ jobFilePath, jobDirPath }` (or in-memory job + application data).
  - Reads job JSON, `jobDir/cover_letter_response.json`, `jobDir/qna.json`, resume paths from `jobDir`.
  - Builds the **API contract payload** (no corpus-rag internals).
  - Calls `apiRequest('/api/job-applications', 'POST', payload)`. Handles 4xx/5xx (log, optionally retry); does not block workflow.
- **Seek bot:** After successful Quick Apply (e.g. in `closeQuickApplyAndContinueSearch` or a dedicated step), call recorder with `ctx.currentJobFile` and `ctx.currentJobDir` (or equivalent). If API_BASE is not set or request fails, log and continue (no hard dependency).

Configuration: `API_BASE` (existing), JWT from existing cache. No MongoDB or corpus-rag imports in finalboss beyond HTTP + contract types if desired.

---

## 6. Job Analytics Page

- **Location:** Can live in **corpus-rag** (e.g. `/app/jobs` or `/app/job-analytics`) or in finalboss; both consume the same `GET /api/job-applications` and `GET /api/job-applications/:id`.
- **List:** Table/cards – appliedAt, title, company, platform, status. Filters: platform, date range.
- **Detail:** Job info, description, cover letter, resume ref, full Q&A list. Phase 2: skills, experience, HR contact.

---

## 7. Phase 2 (Optional)

- **Skills / experience:** Parse from `description`; store in `rawData.skillsRequired`, `rawData.experienceRequired` or new top-level fields.
- **HR contact:** Parse from job page; store in `rawData.contactName`, `rawData.contactEmail`, `rawData.contactPhone`.
- **Resume storage:** Optionally upload resume file to corpus-rag and store URL/path in `application.tailoredResume` or `rawData.resumePaths`.

---

## 8. Summary

| Layer | Responsibility |
|-------|----------------|
| **corpus-rag** | MongoDB Job model, POST/GET job-applications API, JWT auth, ownership. |
| **finalboss** | Build payload from local files, POST to corpus-rag via `apiRequest`, no DB. |
| **Contract** | JSON request/response; upsert by (userId, platform, platformJobId). |

All integration is over HTTP + JSON; loosely coupled, elastic, industry standard.
