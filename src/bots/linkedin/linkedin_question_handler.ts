import type { WorkflowContext } from '../core/workflow_engine';
import { getClientEmailFromContext, getJobArtifactDir } from '../core/client_paths';
import { logger } from '../core/logger';
import { readCanonicalResumeText } from '../../lib/canonical-resume';
import { apiRequest } from '../core/api_client';
import * as fs from 'fs';
import * as path from 'path';

const printLog = (message: string) => {
  console.log(message);
};

export type LinkedInFillFailureReason =
  | 'none'
  | 'missing_container_selector'
  | 'container_not_found'
  | 'option_not_found'
  | 'element_not_found'
  | 'element_not_interactable'
  | 'unsupported_question_type'
  | 'script_error'
  | 'unknown_error';

export interface LinkedInQuestion {
  question: string;
  type: string;
  options: string[];
  opts?: string[];
  containerSelector: string;
}

export interface LinkedInAnsweredQuestion extends LinkedInQuestion {
  answerSource: string;
  selectedAnswer: number | string[] | null;
  textAnswer: string | null;
  originalIndex: number;
}

export interface LinkedInFillQuestionResult {
  success: boolean;
  failureReason: LinkedInFillFailureReason;
  error?: string;
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function mapTextToOptionIndex(answerText: string, options: string[]): number | null {
  if (!answerText || !Array.isArray(options) || options.length === 0) return null;
  const normalizedAnswer = normalizeForMatch(answerText);
  const candidateOptions = options
    .map((opt, idx) => ({ idx, normalized: normalizeForMatch(opt) }))
    .filter(({ normalized }) => normalized && !/^(select an option|select|please select|choose)$/.test(normalized));

  const exact = candidateOptions.find(({ normalized }) => normalized === normalizedAnswer);
  if (exact) return exact.idx;

  const included = candidateOptions.find(({ normalized }) => normalizedAnswer.includes(normalized));
  if (included) return included.idx;

  if (/\byes\b/i.test(answerText)) {
    const yes = candidateOptions.find(({ normalized }) => normalized === 'yes');
    if (yes) return yes.idx;
  }
  if (/\bno\b/i.test(answerText)) {
    const no = candidateOptions.find(({ normalized }) => normalized === 'no');
    if (no) return no.idx;
  }

  return null;
}

function parseAnswerArrayFromText(aiResponse: string): unknown[] {
  if (!aiResponse || typeof aiResponse !== 'string') return [];
  const cleanResponse = aiResponse.trim();
  const startIndex = cleanResponse.indexOf('[');
  if (startIndex === -1) return [];

  let bracketCount = 0;
  let endIndex = -1;
  for (let i = startIndex; i < cleanResponse.length; i++) {
    if (cleanResponse[i] === '[') bracketCount++;
    if (cleanResponse[i] === ']') bracketCount--;
    if (bracketCount === 0) {
      endIndex = i;
      break;
    }
  }
  if (endIndex === -1) return [];

  try {
    const jsonString = cleanResponse.substring(startIndex, endIndex + 1);
    const parsed = JSON.parse(jsonString);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getEmployerQuestionsComparePrompt(): string {
  return `For each of these employer questions, analyze the question and my resume/background, then return ONLY a JSON array with the recommended responses.

Response Format:
- For "select" questions: single number (e.g., 2)
- For "checkbox" questions: array of numbers (e.g., [0,3,7])
- For "text" questions: concise string answer

Example: If Q1 is select (recommend option 3), Q2 is checkbox (recommend options 1,4), Q3 is text:
Return: [3, [1,4], "Your concise answer"]

Rules:
- Return ONLY the array, no explanations or text
- Use 0-based indexing (first option = 0, second = 1, etc.)
- Array length must match number of questions
- Select questions = single number, checkbox questions = array of numbers, text questions = string
- Consider my actual experience and background from resume
- Choose answers that are truthful and aligned with the job

Questions: [Questions List]`;
}

function resolveUseAi(ctx: WorkflowContext): string {
  const formData = (((ctx as any)?.config || {}) as any).formData || {};
  const enableDeepSeek = Boolean(formData.enableDeepSeek);
  const deepSeekApiKey = String(formData.deepSeekApiKey || '').trim();
  if (enableDeepSeek && deepSeekApiKey) {
    return 'deepseek-chat';
  }
  return 'gpt-4o-mini';
}

function mapFailureReason(questionType: string, errorText?: string): LinkedInFillFailureReason {
  const msg = (errorText || '').toLowerCase();
  if (!msg) return 'unknown_error';
  if (msg.includes('containerselector is missing')) return 'missing_container_selector';
  if (msg.includes('container not found')) return 'container_not_found';
  if (msg.includes('option not found') || msg.includes('requested index')) return 'option_not_found';
  if (msg.includes('no such element') || msg.includes('not found')) return 'element_not_found';
  if (msg.includes('not interactable') || msg.includes('element click intercepted') || msg.includes('stale element')) {
    return 'element_not_interactable';
  }
  if (msg.includes('unknown question type')) return 'unsupported_question_type';
  if (msg.includes('javascript error') || msg.includes('execute script')) return 'script_error';
  if ((questionType === 'select' || questionType === 'radio') && msg.includes('index')) return 'option_not_found';
  return 'unknown_error';
}

async function callApiWithFallback(endpoint: string, method: string, body?: any): Promise<any> {
  try {
    return await apiRequest(endpoint, method, body);
  } catch (primaryError) {
    printLog(`⚠️ apiRequest failed for ${endpoint}: ${primaryError}`);
    const baseUrl = process.env.API_BASE || process.env.PUBLIC_API_BASE || 'http://localhost:3000';
    const tokenFromEnv = process.env.CORPUS_RAG_TOKEN || process.env.CORPUS_RAG_API_TOKEN || '';
    const tokenPath = path.join(process.cwd(), '.cache', 'api_token.txt');
    const tokenFromCache = fs.existsSync(tokenPath) ? fs.readFileSync(tokenPath, 'utf8').trim() : '';
    const token = tokenFromEnv || tokenFromCache;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : 'Bearer internal-bot'
    };
    const resp = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`Fallback API ${endpoint} failed (${resp.status}): ${txt}`);
    }
    return await resp.json();
  }
}

export async function getLinkedInIntelligentAnswers(
  questions: LinkedInQuestion[],
  ctx: WorkflowContext
): Promise<LinkedInAnsweredQuestion[]> {
  const answeredQuestions: LinkedInAnsweredQuestion[] = [];
  const aiQuestions: Array<{ q: string; opts: string[] }> = [];
  const formData = (ctx.config as any)?.formData || {};
  const configPhone = String(formData.phone || '').trim();
  const configEmail = String(formData.email || '').trim();

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    let answerSource = 'unknown';
    let selectedAnswer: number | string[] | null = null;
    let textAnswer: string | null = null;
    const qText = (question.question || '').toLowerCase();

    if (configPhone && /mobile phone|phone number|phone|telephone/.test(qText)) {
      if (question.type === 'select' || question.type === 'radio' || question.type === 'combobox') {
        const mapped = mapTextToOptionIndex(configPhone, question.options || []);
        if (mapped !== null) {
          selectedAnswer = mapped;
          answerSource = 'Config (phone)';
        }
      } else {
        textAnswer = configPhone;
        answerSource = 'Config (phone)';
      }
    } else if (configEmail && /email|e-mail/.test(qText)) {
      if (question.type === 'select' || question.type === 'radio' || question.type === 'combobox') {
        const mapped = mapTextToOptionIndex(configEmail, question.options || []);
        if (mapped !== null) {
          selectedAnswer = mapped;
          answerSource = 'Config (email)';
        }
      } else {
        textAnswer = configEmail;
        answerSource = 'Config (email)';
      }
    }

    answeredQuestions.push({
      ...question,
      answerSource,
      selectedAnswer,
      textAnswer,
      originalIndex: i
    });

    if (answerSource === 'unknown') {
      aiQuestions.push({
        q: question.question,
        opts: question.options || []
      });
    }
  }

  if (aiQuestions.length === 0) {
    return answeredQuestions;
  }

  try {
    printLog(`🤖 Calling AI API for ${aiQuestions.length} questions...`);

    const jobData = ctx.currentJobFile
      ? JSON.parse(fs.readFileSync(ctx.currentJobFile, 'utf8'))
      : (ctx.current_job_details || {});
    const jobId = jobData.job_id || jobData.jobId || (ctx.current_job as any)?.job_id || 'unknown';
    const clientEmail = getClientEmailFromContext(ctx) || '';
    const fallbackEmail = String((ctx as any)?.config?.formData?.email || '').trim();
    const userEmail = clientEmail || fallbackEmail;
    if (!userEmail) {
      throw new Error('Missing user email. Canonical resume lookup requires email in config.');
    }
    const preferredResumeFileName = String(((ctx as any)?.config?.formData?.resumeFileName || '')).trim();
    const resume = readCanonicalResumeText(userEmail, preferredResumeFileName);
    const resumeText = String(resume.content || '').trim();
    if (!resumeText) {
      throw new Error(`Canonical resume ${resume.filename} is empty for intelligent Q&A fallback.`);
    }

    const compareRequestBody = {
      userId: userEmail,
      prompt: getEmployerQuestionsComparePrompt(),
      questions: aiQuestions.map((q, idx) => ({
        q: q.q,
        type: answeredQuestions.filter((x) => x.answerSource === 'unknown')[idx]?.type || 'select',
        options: q.opts || []
      })),
      details: jobData.details || jobData.description || `${jobData.title || ''} at ${jobData.company || ''}`,
      stream: false,
      useRag: true,
      jobId: `linkedin_${jobId}`
    };

    const fallbackRequestBody: any = {
      job_id: `linkedin_${jobId}`,
      questions: aiQuestions,
      resume_text: resumeText,
      job_details: compareRequestBody.details,
      platform: 'linkedin',
      platform_job_id: jobId,
      job_title: jobData.title || '',
      company: jobData.company || '',
      prompt: compareRequestBody.prompt,
      useAi: resolveUseAi(ctx)
    };

    const jobDir = getJobArtifactDir(ctx, 'linkedin', jobId);
    fs.writeFileSync(
      path.join(jobDir, 'qna_request.json'),
      JSON.stringify({
        primaryEndpoint: '/api/employer-questions/compare',
        primaryRequest: compareRequestBody,
        fallbackEndpoint: '/api/questionAndAnswers',
        fallbackRequest: fallbackRequestBody
      }, null, 2)
    );

    printLog(`📋 Q&A API request (POST /api/employer-questions/compare):\n${JSON.stringify(compareRequestBody, null, 2)}`);

    let data: any;
    let answerPayload: unknown;
    try {
      data = await callApiWithFallback('/api/employer-questions/compare', 'POST', compareRequestBody);
      const results = Array.isArray(data?.results) ? data.results : [];
      const firstSuccessful = results.find((r: any) => r && !r.error && typeof r.text === 'string');
      answerPayload = firstSuccessful?.text ?? '';
    } catch (compareError) {
      logger.warn('linkedin.qa.compare_api_failed', 'Primary compare API failed, using questionAndAnswers fallback', {
        error: compareError instanceof Error ? compareError.message : String(compareError)
      });
      data = await callApiWithFallback('/api/questionAndAnswers', 'POST', fallbackRequestBody);
      answerPayload = data?.answers;
    }

    fs.writeFileSync(path.join(jobDir, 'qna_response.json'), JSON.stringify(data, null, 2));

    printLog(`✅ AI answers received for ${aiQuestions.length} questions`);
    printLog(`📋 Question answers API response (full):\n${JSON.stringify(data, null, 2)}`);

    if (answerPayload != null) {
      const rawStr = Array.isArray(answerPayload)
        ? JSON.stringify(answerPayload, null, 2)
        : typeof answerPayload === 'string'
          ? answerPayload
          : String(answerPayload);
      printLog(`📋 Question answers API response (data.answers):\n${rawStr}`);
    }

    if (answerPayload) {
      const parsedArray = Array.isArray(answerPayload)
        ? answerPayload
        : parseAnswerArrayFromText(typeof answerPayload === 'string' ? answerPayload : String(answerPayload));

      if (parsedArray.length > 0) {
        printLog(`📋 Parsed ${parsedArray.length} answer(s) from API:`);
        parsedArray.forEach((ans, idx) => {
          printLog(`   [${idx + 1}] ${ans}`);
        });
      }

      let aiAnswerIndex = 0;
      for (let i = 0; i < answeredQuestions.length; i++) {
        if (answeredQuestions[i].answerSource !== 'unknown') continue;
        answeredQuestions[i].answerSource = 'AI API';
        const value = parsedArray[aiAnswerIndex];
        if (value != null && String(value).trim() !== '') {
          const normalizedValue = String(value).trim();
          if (answeredQuestions[i].type === 'select' || answeredQuestions[i].type === 'radio' || answeredQuestions[i].type === 'combobox') {
            const indexCandidate = typeof value === 'number'
              ? value
              : mapTextToOptionIndex(normalizedValue, answeredQuestions[i].options || []);
            if (indexCandidate != null) {
              answeredQuestions[i].selectedAnswer = indexCandidate;
            } else {
              answeredQuestions[i].textAnswer = normalizedValue;
            }
          } else if (answeredQuestions[i].type === 'checkbox') {
            const options = answeredQuestions[i].options || [];
            if (Array.isArray(value)) {
              answeredQuestions[i].selectedAnswer = value
                .map((item) => {
                  if (typeof item === 'number') return options[item];
                  if (typeof item === 'string') {
                    const mapped = mapTextToOptionIndex(item, options);
                    return mapped != null ? options[mapped] : item;
                  }
                  return null;
                })
                .filter(Boolean) as string[];
            } else {
              answeredQuestions[i].selectedAnswer = normalizedValue
                .split(/,|\n|;|\band\b/gi)
                .map((part) => part.trim())
                .filter(Boolean);
            }
          } else {
            answeredQuestions[i].textAnswer = normalizedValue;
          }
        }
        aiAnswerIndex++;
      }
    }
  } catch (error) {
    printLog(`⚠️ AI API failed: ${error}`);
  }

  return answeredQuestions;
}

export async function fillLinkedInQuestionFieldDetailed(
  ctx: WorkflowContext,
  containerSelector: string,
  questionType: string,
  answer: any,
  options: string[] = []
): Promise<LinkedInFillQuestionResult> {
  if (!containerSelector) {
    printLog('❌ Cannot fill field: containerSelector is missing.');
    return { success: false, failureReason: 'missing_container_selector', error: 'containerSelector is missing' };
  }

  try {
    const result = await ctx.driver.executeScript(`
      const containerSelector = arguments[0];
      const questionType = arguments[1];
      const answer = arguments[2];
      const options = Array.isArray(arguments[3]) ? arguments[3] : [];

      function resolveDoc() {
        const iframe = document.querySelector('iframe[active]');
        if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
          return iframe.contentDocument;
        }
        const host = document.querySelector('#interop-outlet');
        if (host && host.shadowRoot) {
          return host.shadowRoot;
        }
        return document;
      }

      function isVisible(el) {
        if (!el) return false;
        if (el.hidden) return false;
        const style = (el.ownerDocument.defaultView || window).getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }

      function setNativeValue(el, value) {
        const proto = Object.getPrototypeOf(el);
        const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
        if (descriptor && descriptor.set) {
          descriptor.set.call(el, value);
        } else {
          el.value = value;
        }
      }

      function getContainer(doc) {
        return doc.querySelector(containerSelector);
      }

      function clickElement(el) {
        if (!el) return false;
        if (typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ block: 'center', inline: 'nearest' });
        }
        const clickable = el.closest('label, button, [role="radio"], [role="checkbox"]') || el;
        clickable.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        clickable.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        clickable.click();
        return true;
      }

      const doc = resolveDoc();
      const container = getContainer(doc);
      if (!container) return { success: false, error: 'Container not found' };

      if (questionType === 'text' || questionType === 'textarea') {
        const input = container.querySelector('textarea, input[type="text"], input:not([type]), textbox, [role="textbox"]');
        if (!input) return { success: false, error: 'Text element not found' };
        const target = input.matches('textbox, [role="textbox"]') ? input.querySelector('input, textarea') || input : input;
        if (!target) return { success: false, error: 'Text input target not found' };
        if (target.isContentEditable) {
          target.textContent = String(answer);
          target.dispatchEvent(new InputEvent('input', { bubbles: true, data: String(answer), inputType: 'insertText' }));
        } else {
          target.focus();
          if ('value' in target) {
            setNativeValue(target, '');
            target.dispatchEvent(new Event('input', { bubbles: true }));
            setNativeValue(target, String(answer));
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            target.textContent = String(answer);
          }
        }
        return { success: true };
      }

      if (questionType === 'select') {
        const select = container.querySelector('select');
        if (!select) return { success: false, error: 'Select element not found' };
        if (!select.options || !select.options[answer]) {
          return { success: false, error: 'Requested index not found in select options' };
        }
        select.selectedIndex = answer;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true };
      }

      if (questionType === 'combobox') {
        const combobox = container.querySelector('combobox, [role="combobox"]');
        if (!combobox) return { success: false, error: 'Combobox not found' };
        const optionEls = Array.from(combobox.querySelectorAll('option')).filter((opt) => {
          const text = (opt.textContent || opt.innerText || '').trim();
          return text && !/^(select|please select|choose|select an option)$/i.test(text);
        });
        if (optionEls[answer]) {
          optionEls[answer].selected = true;
          if ('value' in combobox) {
            combobox.value = optionEls[answer].value;
          }
          combobox.dispatchEvent(new Event('input', { bubbles: true }));
          combobox.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true };
        }

        clickElement(combobox);
        const targetText = String(
          options[answer] ||
          (optionEls[answer]?.textContent || optionEls[answer]?.innerText || '')
        ).trim();
        if (!targetText) return { success: false, error: 'Requested index not found in combobox options' };
        const candidates = Array.from(doc.querySelectorAll('generic[role="option"], [role="option"], option, li'));
        const match = candidates.find((el) => isVisible(el) && ((el.textContent || '').trim() === targetText));
        if (!match) return { success: false, error: 'Dropdown option not found: ' + targetText };
        clickElement(match);
        return { success: true };
      }

      if (questionType === 'radio') {
        const radios = Array.from(container.querySelectorAll('radio, input[type="radio"], [role="radio"]')).filter(isVisible);
        if (!radios[answer]) {
          return { success: false, error: 'Requested index not found in radio options' };
        }
        const target = radios[answer];
        clickElement(target);
        const ariaChecked = target.getAttribute && target.getAttribute('aria-checked');
        const checked = target.checked === true || ariaChecked === 'true' || target.getAttribute('data-checked') === 'true';
        if (!checked) {
          const labelLike = target.nextElementSibling || target.closest('label') || target.parentElement;
          if (labelLike) clickElement(labelLike);
        }
        const finalChecked = target.checked === true || (target.getAttribute && target.getAttribute('aria-checked') === 'true');
        return finalChecked ? { success: true } : { success: false, error: 'Radio button was not checked after clicking' };
      }

      if (questionType === 'checkbox') {
        const requested = Array.isArray(answer) ? answer : [answer];
        const allOptions = Array.from(container.querySelectorAll('checkbox, input[type="checkbox"], [role="checkbox"]')).filter(isVisible);
        const optionLabels = allOptions.map((el) => {
          const siblingText = (el.nextElementSibling?.textContent || '').trim();
          const ariaLabel = (el.getAttribute && el.getAttribute('aria-label')) || '';
          return siblingText || ariaLabel;
        });
        let changed = 0;
        requested.forEach((value) => {
          const targetIndex = typeof value === 'number'
            ? value
            : optionLabels.findIndex((label, idx) => {
                const requestedText = String(value).trim();
                return label === requestedText || String(options[idx] || '').trim() === requestedText;
              });
          if (targetIndex < 0 || !allOptions[targetIndex]) return;
          clickElement(allOptions[targetIndex]);
          changed++;
        });
        return changed > 0 ? { success: true } : { success: false, error: 'Checkbox option not found' };
      }

      return { success: false, error: 'Unknown question type: ' + questionType };
    `, containerSelector, questionType, answer, options) as { success: boolean; error?: string };

    if (!result.success) {
      return {
        success: false,
        failureReason: mapFailureReason(questionType, String(result.error || '')),
        error: String(result.error || '')
      };
    }
    return { success: true, failureReason: 'none' };
  } catch (error) {
    return {
      success: false,
      failureReason: mapFailureReason(questionType, String(error)),
      error: String(error)
    };
  }
}
