/**
 * Job Application Recorder – loosely coupled client for corpus-rag Job Applications API.
 * Builds payload from local job file + job dir and POSTs to backend. No DB dependency.
 */
import * as fs from 'fs';
import * as path from 'path';
import { apiRequest } from './api_client.js';

/** One API call token record for job-applications payload. */
export interface ApiCallTokenRecord {
  endpoint: string;
  timestamp?: string;
  aiProvider?: string;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  processingTime?: number;
}

/** Contract payload for POST /api/job-applications (matches corpus-rag API). */
export interface JobApplicationPayload {
  platform: 'seek' | 'linkedin' | 'indeed' | 'other';
  platformJobId: string;
  title: string;
  company: string;
  url?: string;
  description?: string;
  location?: string;
  salary?: string;
  jobType?: string;
  workMode?: string;
  postedDate?: string;
  closingDate?: string;
  hrContact?: { name?: string; email?: string; phone?: string };
  requiredSkills?: string[];
  requiredExperience?: string;
  jobDetails?: Record<string, unknown>;
  application: {
    coverLetter?: string;
    tailoredResume?: string;
    questionAnswers?: Array<{ question: string; answer: string }>;
    apiCalls?: ApiCallTokenRecord[];
  };
  source?: { jobFile?: string; jobDir?: string };
}

export interface RecordJobApplicationInput {
  /** Path to the job JSON file (e.g. .../jobs/company_jobId.json or .../jobs/linkedinjobs/jobId/job_details.json). */
  jobFilePath: string;
  /** Path to the per-application dir (e.g. .../jobs/jobId) containing cover_letter_response.json, qna.json, resume.* */
  jobDirPath: string;
  /** Platform for the payload; defaults to 'seek' if omitted. */
  platform?: 'seek' | 'linkedin' | 'indeed' | 'other';
}

const printLog = (msg: string) => console.log(msg);

/**
 * Read cover letter text from jobDir/cover_letter_response.json.
 */
function readCoverLetter(jobDirPath: string): string | undefined {
  const p = path.join(jobDirPath, 'cover_letter_response.json');
  if (!fs.existsSync(p)) return undefined;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return data.cover_letter ?? data.coverLetter;
  } catch {
    return undefined;
  }
}

/**
 * Read Q&A from jobDir/qna.json. Normalize to { question, answer }[].
 */
function readQuestionAnswers(jobDirPath: string): Array<{ question: string; answer: string }> {
  const p = path.join(jobDirPath, 'qna.json');
  if (!fs.existsSync(p)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const list = data.questions ?? data.questionAnswers ?? [];
    return list.map((q: any) => ({
      question: typeof q === 'string' ? q : (q.question ?? q.q ?? ''),
      answer: typeof q === 'string' ? '' : (q.answer ?? q.a ?? '')
    })).filter((x: { question: string; answer: string }) => x.question || x.answer);
  } catch {
    return [];
  }
}

/**
 * Prefer resume path (txt or docx) for audit; backend can store path or later upload.
 */
function readResumeRef(jobDirPath: string): string | undefined {
  const txt = path.join(jobDirPath, 'resume.txt');
  if (fs.existsSync(txt)) return txt;
  const docx = path.join(jobDirPath, 'resume.docx');
  if (fs.existsSync(docx)) return docx;
  return undefined;
}

/**
 * Read token usage from a response JSON file (cover_letter_response, qna_response, resume_response).
 */
function readTokenUsage(
  jobDirPath: string,
  filename: string,
  endpoint: string
): ApiCallTokenRecord | null {
  const p = path.join(jobDirPath, filename);
  if (!fs.existsSync(p)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const tokensUsed = data.actualTokensUsed ?? data.tokensUsed;
    const inputTokens = data.inputTokens;
    const outputTokens = data.outputTokens;
    if (tokensUsed == null && inputTokens == null && outputTokens == null) return null;
    return {
      endpoint,
      timestamp: data.timestamp ?? new Date().toISOString(),
      aiProvider: data.aiProvider ?? 'unknown',
      tokensUsed: typeof tokensUsed === 'number' ? tokensUsed : undefined,
      inputTokens: typeof inputTokens === 'number' ? inputTokens : undefined,
      outputTokens: typeof outputTokens === 'number' ? outputTokens : undefined,
      cost: typeof data.cost === 'number' ? data.cost : undefined,
      processingTime: typeof data.processingTime === 'number' ? data.processingTime : undefined
    };
  } catch {
    return null;
  }
}

/**
 * Build apiCalls array from jobDir response files (cover letter, Q&A, resume).
 */
function readApiCallsFromJobDir(jobDirPath: string): ApiCallTokenRecord[] {
  const calls: ApiCallTokenRecord[] = [];
  const cover = readTokenUsage(jobDirPath, 'cover_letter_response.json', '/api/cover_letter');
  if (cover) calls.push(cover);
  const qna = readTokenUsage(jobDirPath, 'qna_response.json', '/api/questionAndAnswers');
  if (qna) calls.push(qna);
  const resume = readTokenUsage(jobDirPath, 'resume_response.json', '/api/resume');
  if (resume) calls.push(resume);
  return calls;
}

/**
 * Build payload from job file + job dir (contract-only; no backend types).
 */
export function buildJobApplicationPayload(input: RecordJobApplicationInput): JobApplicationPayload | null {
  const { jobFilePath, jobDirPath, platform: inputPlatform } = input;

  if (!fs.existsSync(jobFilePath)) {
    printLog(`[JobRecorder] Job file not found: ${jobFilePath}`);
    return null;
  }

  let jobData: any;
  try {
    jobData = JSON.parse(fs.readFileSync(jobFilePath, 'utf8'));
  } catch (e) {
    printLog(`[JobRecorder] Failed to parse job file: ${e}`);
    return null;
  }

  const platformJobId = jobData.job_id || jobData.jobId || '';
  const title = jobData.title || jobData.raw_title || '';
  const company = jobData.company || '';
  const platform = inputPlatform ?? (jobFilePath.includes('linkedinjobs') ? 'linkedin' : 'seek');

  if (!platformJobId || !title || !company) {
    printLog('[JobRecorder] Job file missing jobId, title or company');
    return null;
  }

  const coverLetter = readCoverLetter(jobDirPath);
  const questionAnswers = readQuestionAnswers(jobDirPath);
  const tailoredResume = readResumeRef(jobDirPath);
  const apiCalls = readApiCallsFromJobDir(jobDirPath);

  // Extra job fields for Job details tab (posted, category, application_volume, etc.)
  const jobDetails: Record<string, unknown> = {};
  if (jobData.posted != null) jobDetails.posted = jobData.posted;
  if (jobData.application_volume != null) jobDetails.application_volume = jobData.application_volume;
  if (jobData.category != null) jobDetails.category = jobData.category;
  if (jobData.raw_title != null) jobDetails.raw_title = jobData.raw_title;

  return {
    platform,
    platformJobId,
    title,
    company,
    url: jobData.url,
    description: jobData.details || jobData.description,
    location: jobData.location,
    salary: jobData.salary_note || jobData.salary || jobData.category,
    jobType: jobData.work_type || jobData.jobType,
    workMode: jobData.workMode,
    postedDate: typeof jobData.posted === 'string' ? jobData.posted : undefined,
    hrContact: jobData.hrContact,
    requiredSkills: Array.isArray(jobData.requiredSkills) ? jobData.requiredSkills : undefined,
    requiredExperience: typeof jobData.requiredExperience === 'string' ? jobData.requiredExperience : undefined,
    ...(Object.keys(jobDetails).length > 0 ? { jobDetails } : {}),
    application: {
      coverLetter,
      tailoredResume,
      questionAnswers,
      ...(apiCalls.length > 0 ? { apiCalls } : {})
    },
    source: { jobFile: jobFilePath, jobDir: jobDirPath }
  };
}

/**
 * Record one job application to corpus-rag (POST /api/job-applications).
 * Does not throw; logs and returns success/failure so the bot workflow can continue.
 */
export async function recordJobApplicationToBackend(input: RecordJobApplicationInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const payload = buildJobApplicationPayload(input);
  if (!payload) {
    return { ok: false, error: 'Could not build payload from job file and dir' };
  }

  try {
    const result = await apiRequest('/api/job-applications', 'POST', payload);
    const id = result?.id ?? result?.data?.id;
    printLog(`[JobRecorder] Recorded application: ${payload.company} / ${payload.title} (${id ?? 'ok'})`);
    return { ok: true, id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    printLog(`[JobRecorder] Failed to record application: ${message}`);
    return { ok: false, error: message };
  }
}

/**
 * Build job dir path from job file path and jobId (e.g. .../jobs/company_123.json -> .../jobs/123).
 */
export function getJobDirPathFromJobFile(jobFilePath: string, jobId: string): string {
  return path.join(path.dirname(jobFilePath), jobId);
}
