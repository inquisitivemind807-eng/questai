# LinkedIn DB-Backed Q&A Flow — Plan

## Problem

In the apply-only flow (`linkedin_apply_steps.yaml`), `extractEmployerQuestions` crashes with `TypeError [ERR_INVALID_ARG_TYPE]: path must be a string` because `ctx.currentJobFile` is never initialized. The apply flow skips `extractJobDetailsFromPanel` (which sets `ctx.currentJobFile`), so downstream functions that read/write files fail.

## Root Cause

All downstream functions (`extractEmployerQuestions`, `answerQuestions`, `handleCoverLetter`, `generateAICoverLetterLinkedIn`, `generateAIResumeLinkedIn`) read from the local filesystem (`ctx.currentJobFile` → `job_details.json`). In the apply-only flow, this file is never created.

## Solution: DB-only reads/writes (no filesystem)

## 1. Backend: Add GET handler to `/api/scraped-jobs`

**File:** `corpus-rag/src/routes/api/scraped-jobs/+server.ts`

```typescript
export async function GET({ url, locals }) {
  const platform = url.searchParams.get('platform');
  const platformJobId = url.searchParams.get('platformJobId');
  if (!platform || !platformJobId) {
    return json({ error: 'platform and platformJobId required' }, { status: 400 });
  }
  const job = await jobModel.findByPlatformId(
    locals.auth.user.id,
    platform as PlatformType,
    platformJobId
  );
  return json(job || {});
}
```

Model method already exists: `JobModel.findByPlatformId(userId, platform, platformJobId)` → returns `Job | null`.

## 2. Bot: Replace file writes in `extractEmployerQuestions`

**File:** `questai/src/bots/linkedin/linkedin_impl.ts`

Replace lines 2756-2778 (file read + file write) with DB-backed logic:

```typescript
if (questionsData && questionsData.questionsFound > 0) {
  printLog(`Found ${questionsData.questionsFound} employer questions`);

  const jobId = (ctx.current_job as any)?.job_id || 'unknown';
  const cleanQuestions = questionsData.questions.map((q: any, idx: number) => ({
    id: idx,
    q: q.question,
    type: q.type,
    opts: q.options || [],
    containerSelector: q.containerSelector
  }));

  // Upsert questions into MongoDB via existing POST endpoint
  const saved = await apiRequest('/api/scraped-jobs', 'POST', {
    platform: 'linkedin',
    platformJobId: jobId,
    questions: cleanQuestions
  });

  ctx.current_job_details = saved;
  printLog('Saved questions to DB');
  yield 'employer_questions_saved';
} else {
  printLog('No employer questions found');
  yield 'no_employer_questions';
}
```

## 3. Bot: Replace file reads in `answerQuestions`

Replace lines 2804-2817:

```typescript
let questions: Array<...> = [];

// Prefer in-memory (set by extractEmployerQuestions)
let jobData = ctx.current_job_details;
if (!jobData) {
  // Fallback: fetch from DB
  try {
    jobData = await apiRequest(
      `/api/scraped-jobs?platform=linkedin&platformJobId=${(ctx.current_job as any)?.job_id}`,
      'GET'
    );
  } catch {
    // ignore
  }
}

if (jobData && jobData.questions) {
  const raw = (jobData.questions || []) as Array<...>;
  questions = raw.map(...).filter(...);
}
```

## 4. Secondary functions (defer)

- `handleCoverLetter` / `generateAICoverLetterLinkedIn` — read from `ctx.current_job_details` when available; fall back to file read for backward compat
- `generateAIResumeLinkedIn` — same pattern

## Files Changed

| File | Change |
|---|---|
| `corpus-rag/src/routes/api/scraped-jobs/+server.ts` | Add GET handler |
| `questai/src/bots/linkedin/linkedin_impl.ts` | Replace file I/O with API calls in `extractEmployerQuestions` + `answerQuestions` |
