import type { WorkflowContext } from '../../core/workflow_engine';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { By } from 'selenium-webdriver';
import { Document, Paragraph, TextRun, Packer } from 'docx';
// @ts-ignore - pdfkit types are not installed in this project.
import PDFDocument from 'pdfkit';
import { getJobArtifactDir } from '../../core/client_paths';
import { readCanonicalResumeText } from '../../../lib/canonical-resume';
import { callApiWithFallback } from './api_fallback';
import { resolveUseAi } from './ai_provider';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const printLog = (message: string) => {
  console.log(message);
};

async function createResumeFile(ctx: WorkflowContext, resumeText: string, jobId: string): Promise<string> {
  const jobDir = getJobArtifactDir(ctx, 'seek', jobId);
  const docxPath = path.join(jobDir, 'resume.docx');
  const pdfPath = path.join(jobDir, 'resume.pdf');

  const paragraphs = resumeText.split('\n').map(line =>
    new Paragraph({
      children: [new TextRun(line)]
    })
  );

  const doc = new Document({
    sections: [{
      properties: {},
      children: paragraphs
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(docxPath, buffer);
  printLog(`💾 Created: resume.docx`);

  const pdfDoc = new PDFDocument();
  const stream = fs.createWriteStream(pdfPath);
  pdfDoc.pipe(stream);
  pdfDoc.fontSize(12).text(resumeText, {
    align: 'left'
  });
  pdfDoc.end();

  await new Promise<void>((resolve) => stream.on('finish', () => resolve()));
  printLog(`💾 Created: resume.pdf`);

  return docxPath;
}

async function resolveResumeText(ctx: WorkflowContext): Promise<string> {
  const userEmail = String((ctx as any)?.config?.formData?.email || '').trim();
  if (!userEmail) {
    throw new Error('Missing user email. Canonical resume lookup requires email in config.');
  }
  const preferredResumeFileName = String(((ctx as any)?.config?.formData?.resumeFileName || '')).trim();
  const resume = readCanonicalResumeText(userEmail, preferredResumeFileName);
  printLog(`📄 Using canonical resume: ${resume.filename}`);
  return resume.content;
}

async function generateAIResume(ctx: WorkflowContext): Promise<string> {
  let jobData: any = {};
  if (ctx.currentJobFile) {
    jobData = JSON.parse(fs.readFileSync(ctx.currentJobFile, 'utf8'));
  }

  if (!jobData.title || !jobData.company) {
    throw new Error("No job data available - cannot generate resume");
  }

  const jobId = jobData.jobId || 'unknown';
  printLog("Generating AI resume...");
  printLog(`📝 Job: ${jobData.title} at ${jobData.company}`);

  const resumeText = await resolveResumeText(ctx);
  const useAi = resolveUseAi(ctx);

  const requestBody: Record<string, any> = {
    job_id: `seek_${jobId}`,
    job_details: jobData.details || `${jobData.title} at ${jobData.company}`,
    resume_text: resumeText,

    // Required tracking fields per API docs
    platform: "seek",
    platform_job_id: jobId,
    job_title: jobData.title || '',
    company: jobData.company || '',

    // Custom prompt for better AI results
    prompt: `Tailor this resume for the Seek job posting.
Optimize for ATS (Applicant Tracking Systems) by including relevant keywords from the job description.
Highlight experience and skills that directly match the job requirements.
Keep formatting clean and professional. Focus on quantifiable achievements.`
  };
  requestBody.useAi = useAi;

  const jobDir = getJobArtifactDir(ctx, 'seek', jobId);

  fs.writeFileSync(
    path.join(jobDir, 'resume_request.json'),
    JSON.stringify(requestBody, null, 2)
  );

  // Fetch resume-enhancement prompt from corpus-rag, fallback to legacy resume-tailor key.
  const { apiRequest } = await import('../../core/api_client');
  try {
    let promptRes = await apiRequest('/api/prompts/resume-enhancement', 'GET');
    if (!promptRes?.content) {
      promptRes = await apiRequest('/api/prompts/resume-tailor', 'GET');
    }
    if (promptRes?.content) requestBody.prompt = promptRes.content;
  } catch (e) {
    printLog('⚠️ Could not fetch resume-enhancement prompt, using embedded fallback');
  }

  let data: any;
  try {
    data = await callApiWithFallback('/api/resume', 'POST', requestBody);
  } catch (err) {
    printLog(`⚠️ Resume enhancement API unavailable, using canonical resume text. Error: ${err}`);
    return resumeText;
  }

  fs.writeFileSync(
    path.join(jobDir, 'resume_response.json'),
    JSON.stringify(data, null, 2)
  );

  if (data.resume) {
    printLog("✅ AI resume generated");
    printLog(`📄 Length: ${data.resume.length} chars`);
    return data.resume;
  } else {
    throw new Error('No resume field returned from API');
  }
}

// Handle Resume Upload/Selection (Choose Documents step)
export async function* handleResumeSelection(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    printLog("Handling resume with mandatory AI generation + upload...");

    const resumeUi = await ctx.driver.executeScript(`
      const uploadRadio =
        document.querySelector('input[data-testid="resume-method-upload"][value="upload"]') ||
        document.querySelector('input[type="radio"][value="upload"]');
      const fileInput =
        document.querySelector('input[data-testid="file-input"][type="file"]') ||
        document.querySelector('input[type="file"]');
      const resumeSelect =
        document.querySelector('select[data-testid="select-input"]') ||
        document.querySelector('select[name*="resume" i]');
      return {
        hasUploadRadio: !!uploadRadio,
        hasFileInput: !!fileInput,
        hasResumeSelect: !!resumeSelect
      };
    `) as { hasUploadRadio: boolean; hasFileInput: boolean; hasResumeSelect: boolean };

    if (!resumeUi.hasUploadRadio && !resumeUi.hasFileInput && !resumeUi.hasResumeSelect) {
      printLog("ℹ️ Resume field not present in this Quick Apply step");
      yield "resume_not_required";
      return;
    }

    printLog("🤖 Resume requested by Seek - generating AI-enhanced resume...");
    const resumeText = await generateAIResume(ctx);

    let jobData: any = {};
    if (ctx.currentJobFile) {
      jobData = JSON.parse(fs.readFileSync(ctx.currentJobFile, 'utf8'));
    }
    const resumeFilePath = await createResumeFile(ctx, resumeText, jobData.jobId || 'unknown');
    const uploadedFileName = path.basename(resumeFilePath);

    if (resumeUi.hasUploadRadio) {
      const uploadRadioClicked = await ctx.driver.executeScript(`
        const uploadRadio =
          document.querySelector('input[data-testid="resume-method-upload"][value="upload"]') ||
          document.querySelector('input[type="radio"][value="upload"]');
        if (!uploadRadio) return false;
        uploadRadio.click();
        uploadRadio.checked = true;
        uploadRadio.dispatchEvent(new Event('change', { bubbles: true }));
        uploadRadio.dispatchEvent(new Event('click', { bubbles: true }));
        return true;
      `);
      if (!uploadRadioClicked) {
        throw new Error('Resume upload radio exists but could not be selected');
      }
      await ctx.driver.sleep(800);
    }

    printLog("📤 Uploading API-generated resume file...");
    const fileInputSelectors = [
      'input[data-testid="file-input"][type="file"]',
      'input[type="file"]'
    ];
    let uploaded = false;
    let lastUploadError: unknown = null;

    for (const selector of fileInputSelectors) {
      try {
        const input = await ctx.driver.findElement(By.css(selector));
        await input.sendKeys(resumeFilePath);
        uploaded = true;
        break;
      } catch (e) {
        lastUploadError = e;
      }
    }

    if (!uploaded) {
      throw new Error(`Failed to upload generated resume file: ${String(lastUploadError)}`);
    }

    await ctx.driver.sleep(2500);
    const uploadVerified = await ctx.driver.executeScript(`
      const expected = arguments[0].toLowerCase();
      const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
      const inputHasFile = fileInputs.some((i) => {
        const anyI = i;
        const hasFiles = anyI.files && anyI.files.length > 0;
        const hasValue = typeof anyI.value === 'string' && anyI.value.toLowerCase().includes(expected);
        return hasFiles || hasValue;
      });
      if (inputHasFile) return true;
      const bodyText = (document.body && document.body.innerText ? document.body.innerText : '').toLowerCase();
      return bodyText.includes(expected);
    `, uploadedFileName) as boolean;

    if (!uploadVerified) {
      throw new Error('Resume upload could not be verified on page');
    }

    printLog("✅ AI-generated resume uploaded successfully");
    yield "resume_selected";

  } catch (error) {
    printLog(`💥 Resume handling error: ${error}`);
    if (error instanceof Error) {
      printLog(`💥 Error stack: ${error.stack}`);
    }
    yield "resume_selection_error";
  }
}