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

  const requestBody = {
    job_id: `seek_${jobId}`,
    job_details: jobData.details || `${jobData.title} at ${jobData.company}`,
    resume_text: resumeText,
    useAi: "deepseek-chat",

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

  const jobDir = getJobArtifactDir(ctx, 'seek', jobId);

  fs.writeFileSync(
    path.join(jobDir, 'resume_request.json'),
    JSON.stringify(requestBody, null, 2)
  );

  // Use apiRequest helper for authenticated calls
  const { apiRequest } = await import('../../core/api_client');
  const data = await apiRequest('/api/resume', 'POST', requestBody);

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
    printLog("Handling resume with AI generation and upload...");

    // Step 1: Generate AI resume
    printLog("🤖 Generating AI-tailored resume...");
    const resumeText = await generateAIResume(ctx);

    // Step 2: Create resume file
    let jobData: any = {};
    if (ctx.currentJobFile) {
      jobData = JSON.parse(fs.readFileSync(ctx.currentJobFile, 'utf8'));
    }
    const resumeFilePath = await createResumeFile(
      ctx,
      resumeText,
      jobData.jobId || 'unknown'
    );

    // Step 3: Click "Upload a resumé" radio button
    printLog("🔍 Looking for upload resume option...");

    const uploadRadioClicked = await ctx.driver.executeScript(`
      // Find and click the "Upload a resumé" radio button
      const uploadRadio = document.querySelector('input[data-testid="resume-method-upload"][value="upload"]');
      if (uploadRadio) {
        uploadRadio.click();
        uploadRadio.checked = true;
        uploadRadio.dispatchEvent(new Event('change', { bubbles: true }));
        uploadRadio.dispatchEvent(new Event('click', { bubbles: true }));
        console.log('Upload radio button clicked');
        return true;
      }
      return false;
    `);

    if (uploadRadioClicked) {
      printLog("✅ Upload resume option selected");
      await ctx.driver.sleep(1000); // Wait for UI to update

      // Step 4: Upload the file
      printLog("📤 Uploading resume file...");

      try {
        // Find the hidden file input - it should be visible now
        const fileInput = await ctx.driver.findElement(By.css('input[data-testid="file-input"][type="file"]'));

        // Send the absolute file path to the input
        await fileInput.sendKeys(resumeFilePath);
        printLog("✅ Resume file uploaded successfully");

        await ctx.driver.sleep(3000); // Wait for upload to process

        yield "resume_selected";
        return;
      } catch (uploadError) {
        printLog(`⚠️ File upload failed: ${uploadError}`);
        printLog("Falling back to existing resume selection...");
      }
    } else {
      printLog("⚠️ Upload resume radio button not found");
    }

    // Step 4: Fallback - try to select existing resume
    printLog("📋 Checking for existing resume options...");
    const resumeSelected = await ctx.driver.executeScript(`
      const select = document.querySelector('select[data-testid="select-input"]');
      if (select && select.options && select.options.length > 1) {
        for (let i = 1; i < select.options.length; i++) {
          if (select.options[i].value && select.options[i].value !== '') {
            select.value = select.options[i].value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('Selected resume:', select.options[i].text);
            return true;
          }
        }
      }
      return false;
    `);

    if (resumeSelected) {
      await ctx.driver.sleep(1000);
      printLog("✅ Selected existing resume from dropdown");
      yield "resume_selected";
      return;
    }

    printLog("ℹ️ No upload option or existing resume found - will skip resume");
    yield "resume_not_required";

  } catch (error) {
    printLog(`💥 Resume handling error: ${error}`);
    if (error instanceof Error) {
      printLog(`💥 Error stack: ${error.stack}`);
    }
    yield "resume_selection_error";
  }
}