import type { WorkflowContext } from '../../core/workflow_engine';
import { isGenericQuestion, getGenericAnswer } from './generic_question_handler';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Parse API response text like "**Question 1:**\nAnswer one\n\n**Question 2:**\nAnswer two"
 * into an array of answer strings. Returns empty array if format is unrecognized.
 */
function parseQuestionAnswersFromText(text: string): string[] {
  const out: string[] = [];
  const re = /\*\*Question\s*(\d+)\s*\*\*\s*[:\s]*([\s\S]*?)(?=\*\*Question\s*\d+\s*\*\*|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const answer = (m[2] || '').trim();
    if (answer && !answer.startsWith('Based on the provided resume')) {
      out.push(answer);
    }
  }
  if (out.length > 0) return out;
  // Fallback: treat whole block as one answer only if it looks like a short direct answer
  const trimmed = text.replace(/^Based on the provided resume[.:\s\n]*/i, '').trim();
  if (trimmed.length > 0 && trimmed.length < 500) {
    return [trimmed];
  }
  return [];
}

/**
 * Unified intelligent question answering function
 * Used by both main flow and test flow
 *
 * Flow:
 * 1. Check if question matches generic questions config → use generic answer
 * 2. If no match → send to AI via employer questions API → use AI answer
 * 3. Fallback to default answers if all else fails
 */
export async function getIntelligentAnswers(questions: any[], ctx: WorkflowContext): Promise<any[]> {
  const answeredQuestions = [];
  const aiQuestions = [];
  const genericAnsweredIndices = new Set();

  const formData = (ctx.config as any)?.formData || {};
  const configPhone = (formData.phone || '').trim();
  const configEmail = (formData.email || '').trim();

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    let answerSource = 'unknown';
    let selectedAnswer = null;
    let textAnswer = null;
    const qText = (question.question || '').toLowerCase();

    if (configPhone && (qText.includes('mobile phone') || qText.includes('phone number') || qText.includes('phone') || qText.includes('telephone'))) {
      textAnswer = configPhone;
      answerSource = 'Config (phone)';
      genericAnsweredIndices.add(i);
    } else if (configEmail && (qText.includes('email') || qText.includes('e-mail'))) {
      textAnswer = configEmail;
      answerSource = 'Config (email)';
      genericAnsweredIndices.add(i);
    } else if (isGenericQuestion(question.question)) {
      const genericAnswer = getGenericAnswer(question.question, question.type, question.options || []);
      if (genericAnswer !== null) {
        answerSource = 'Generic Config';
        genericAnsweredIndices.add(i);
        if (question.type === 'select') {
          selectedAnswer = genericAnswer;
        } else if (question.type === 'radio') {
          selectedAnswer = genericAnswer;
        } else if (question.type === 'checkbox') {
          if (Array.isArray(genericAnswer)) {
            const checkboxAnswers = genericAnswer.map((index: number) => question.options[index]).filter(Boolean);
            selectedAnswer = checkboxAnswers;
          }
        } else if (question.type === 'text' || question.type === 'textarea') {
          textAnswer = genericAnswer;
        }
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

  if (aiQuestions.length > 0) {
    try {
      console.log(`🤖 Calling AI API for ${aiQuestions.length} questions...`);

      const jobData = ctx.currentJobFile ?
        JSON.parse(fs.readFileSync(ctx.currentJobFile, 'utf8')) :
        {};

      const jobId = jobData.job_id || jobData.jobId || 'unknown';
      const platform = (ctx as any).platform || (ctx.currentJobFile && ctx.currentJobFile.includes('linkedinjobs') ? 'linkedin' : 'seek');

      const resumePath = path.join(process.cwd(), 'src/bots/all-resumes/software_engineer.txt');
      const resumeText = fs.existsSync(resumePath)
        ? fs.readFileSync(resumePath, 'utf8')
        : "Experienced software developer";

      const requestBody = {
        job_id: `${platform}_${jobId}`,
        questions: aiQuestions,
        resume_text: resumeText,
        useAi: "deepseek-chat",
        job_details: jobData.details || jobData.description || `${jobData.title || ''} at ${jobData.company || ''}`,

        platform,
        platform_job_id: jobId,
        job_title: jobData.title || '',
        company: jobData.company || '',

        prompt: `Answer these employer screening questions professionally and honestly based on the provided resume.
For multiple choice questions, select the most appropriate option that matches the candidate's experience.
For text questions, provide clear, concise answers (1-2 sentences).
Be truthful - if the candidate doesn't have a specific qualification, indicate that politely while highlighting related experience.`
      };

      const jobDir = platform === 'linkedin'
        ? path.join(process.cwd(), 'jobs', 'linkedinjobs', jobId)
        : path.join(__dirname, '../../jobs', jobId);
      if (!fs.existsSync(jobDir)) {
        fs.mkdirSync(jobDir, { recursive: true });
      }

      fs.writeFileSync(
        path.join(jobDir, 'qna_request.json'),
        JSON.stringify(requestBody, null, 2)
      );

      console.log(`📋 Question answers API request (POST /api/questionAndAnswers):\n${JSON.stringify(requestBody, null, 2)}`);

      // Use apiRequest helper for authenticated calls
      const { apiRequest } = await import('../../core/api_client');
      const data = await apiRequest('/api/questionAndAnswers', 'POST', requestBody);

      fs.writeFileSync(
        path.join(jobDir, 'qna_response.json'),
        JSON.stringify(data, null, 2)
      );

      console.log(`✅ AI answers received for ${aiQuestions.length} questions`);
      console.log(`📋 Question answers API response (full):\n${JSON.stringify(data, null, 2)}`);

      // Log answers field explicitly for readability
      if (data.answers != null) {
        const rawStr = Array.isArray(data.answers)
          ? JSON.stringify(data.answers, null, 2)
          : typeof data.answers === 'string'
            ? data.answers
            : String(data.answers);
        console.log(`📋 Question answers API response (data.answers):\n${rawStr}`);
      }

      // Only set textAnswer when we have a real answer; otherwise leave field empty
      if (data.answers) {
        const raw = data.answers;
        const perQuestion: string[] = Array.isArray(raw)
          ? raw
          : parseQuestionAnswersFromText(typeof raw === 'string' ? raw : String(raw));

        if (perQuestion.length > 0) {
          console.log(`📋 Parsed ${perQuestion.length} answer(s) from API:`);
          perQuestion.forEach((ans, idx) => {
            console.log(`   [${idx + 1}] ${ans}`);
          });
        }

        let aiAnswerIndex = 0;
        for (let i = 0; i < answeredQuestions.length; i++) {
          if (answeredQuestions[i].answerSource === 'unknown') {
            answeredQuestions[i].answerSource = 'AI API';
            const value = perQuestion[aiAnswerIndex];
            if (value != null && value.trim() !== '') {
              answeredQuestions[i].textAnswer = value.trim();
            }
            // else: leave textAnswer null so the field is not filled
            aiAnswerIndex++;
          }
        }
      }
    } catch (error) {
      console.log(`⚠️ AI API failed: ${error}`);
    }
  }

  return answeredQuestions;
}

/**
 * Extract questions from current page using the browser script
 */
export async function extractQuestionsFromPage(ctx: WorkflowContext): Promise<any[]> {
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');

  // Get current file directory
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Use the same extraction logic as the test
  const scriptPath = path.join(__dirname, '../scripts/browser_question_extractor.js');
  const browserScript = fs.readFileSync(scriptPath, 'utf8');
  const extractedData: any = await ctx.driver.executeScript(browserScript);

  if (!extractedData || extractedData.questionsFound === 0) {
    return [];
  }

  return extractedData.questions;
}