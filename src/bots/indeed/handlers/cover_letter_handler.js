import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { readCanonicalResumeText } from '../../../lib/canonical-resume';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @param {string} message */
const printLog = (message) => {
  console.log(message);
};

/** @param {any} ctx */
async function resolveResumeText(ctx) {
  const userEmail = String(ctx?.config?.formData?.email || '').trim();
  if (!userEmail) {
    throw new Error('Missing user email. Canonical resume lookup requires email in config.');
  }
  const preferredResumeFileName = String(ctx?.config?.formData?.resumeFileName || '').trim();
  const resume = readCanonicalResumeText(userEmail, preferredResumeFileName);
  printLog(`📄 Using canonical resume: ${resume.filename}`);
  return resume.content;
}

/** @param {any} ctx */
async function generateAICoverLetter(ctx) {
  let jobData = /** @type {any} */ ({});
  if (ctx.currentJobFile) {
    jobData = JSON.parse(fs.readFileSync(ctx.currentJobFile, 'utf8'));
  }

  if (!jobData.title || !jobData.company) {
    throw new Error("No job data available - cannot generate cover letter");
  }

  const jobId = jobData.jobId || 'unknown';
  printLog("Generating AI cover letter...");
  printLog(`📝 Job: ${jobData.title} at ${jobData.company}`);

  const resumeText = await resolveResumeText(ctx);

  const requestBody = {
    job_id: `indeed_${jobId}`,
    job_details: jobData.details || `${jobData.title} at ${jobData.company}`,
    resume_text: resumeText,
    useAi: "deepseek-chat",

    // Required tracking fields per API docs
    platform: "indeed",
    platform_job_id: jobId,
    job_title: jobData.title || '',
    company: jobData.company || '',

    // Custom prompt for better AI results
    prompt: `Write a compelling, professional cover letter for this Indeed job posting.
Highlight relevant experience and skills that match the job requirements.
Keep it concise (300-400 words) and personalized to ${jobData.company || 'the company'}.
Focus on demonstrating value and enthusiasm for the role.`
  };

  const jobDir = path.join(__dirname, '../../jobs', jobId);
  if (!fs.existsSync(jobDir)) {
    fs.mkdirSync(jobDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(jobDir, 'cover_letter_request.json'),
    JSON.stringify(requestBody, null, 2)
  );

  // Fetch cover letter prompt from corpus-rag
  const { apiRequest } = await import('../../core/api_client.js');
  try {
    const promptRes = await apiRequest('/api/prompts/cover-letter', 'GET');
    if (promptRes?.content) {
      requestBody.prompt = promptRes.content;
    }
  } catch (e) {
    printLog(`⚠️ Could not fetch cover-letter prompt, using embedded fallback`);
  }

  let data;
  try {
    data = await apiRequest('/api/cover_letter', 'POST', requestBody);
  } catch (apiError) {
    const message = apiError instanceof Error ? apiError.message : String(apiError);
    printLog(`❌ API request failed: ${message}`);
    throw new Error(`Cover letter API call failed: ${message}`);
  }

  fs.writeFileSync(
    path.join(jobDir, 'cover_letter_response.json'),
    JSON.stringify(data, null, 2)
  );

  // Check for error response
  if (data.success === false) {
    throw new Error(`API returned error: ${data.error || 'Unknown error'}`);
  }

  if (data.cover_letter) {
    printLog("✅ AI cover letter generated");
    printLog(`📄 Length: ${data.cover_letter.length} chars`);
    return data.cover_letter;
  } else {
    printLog(`❌ API response missing cover_letter field. Response: ${JSON.stringify(data)}`);
    throw new Error('No cover_letter field returned from API');
  }
}

// Handle Cover Letter (part of Choose Documents step)
/** @param {any} ctx */
export async function* handleCoverLetter(ctx) {
  try {
    printLog("Handling cover letter...");

    // Step 1: Click cover letter radio button
    const radioClicked = await ctx.page.evaluate(`
      const coverLetterRadio = document.querySelector('input[data-testid="coverLetter-method-change"]');
      if (coverLetterRadio && !coverLetterRadio.checked) {
        coverLetterRadio.click();
        coverLetterRadio.checked = true;

        // Dispatch change event
        const changeEvent = new Event('change', { bubbles: true });
        coverLetterRadio.dispatchEvent(changeEvent);

        // Dispatch click event
        const clickEvent = new Event('click', { bubbles: true });
        coverLetterRadio.dispatchEvent(clickEvent);

        console.log('Cover letter radio clicked successfully');
        return true;
      }
      return false;
    `);

    if (!radioClicked) {
      printLog("Cover letter radio not found or already selected");
      yield "cover_letter_not_required";
      return;
    }

    printLog("Cover letter radio clicked successfully");

    // Step 2: Wait for textarea to appear
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 3: Generate AI-powered cover letter
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      printLog("🔍 Step 1: Finding textarea element...");
      const textarea = ctx.page.locator('textarea[data-testid="coverLetterTextInput"]').first();
      printLog("✅ Step 1: Textarea found successfully");

      // Clear any existing content
      printLog("🔍 Step 2: Clearing existing content...");
      await textarea.clear();
      printLog("✅ Step 2: Content cleared successfully");

      // Generate AI-powered cover letter based on job description
      printLog("🔍 Step 3: Generating AI cover letter - this MUST succeed, no fallbacks!");
      const coverLetterText = await generateAICoverLetter(ctx);
      printLog("✅ Step 3: AI cover letter generated successfully");

      if (!coverLetterText || coverLetterText.trim().length < 50) {
        throw new Error(`Generated cover letter is too short: ${coverLetterText?.length || 0} chars`);
      }

      // Use fill method to simulate human typing
      printLog("🔍 Step 4: Filling AI-generated cover letter text...");
      await textarea.fill(coverLetterText);
      printLog("✅ Step 4: Text filled successfully");

      // Give it a moment to process
      printLog("🔍 Step 5: Waiting for form processing...");
      await new Promise(resolve => setTimeout(resolve, 1000));
      printLog("✅ Step 5: Processing wait complete");

      // Verify the content was set
      printLog("🔍 Step 6: Verifying content was set and checking validation...");
      const textareaResult = await ctx.page.evaluate(`
        const textarea = document.querySelector('textarea[data-testid="coverLetterTextInput"]');
        if (textarea) {
          const finalValue = textarea.value;
          const valueLength = finalValue.length;

          // Check for validation errors
          const errorElements = document.querySelectorAll('[role="alert"], .error, .invalid, [aria-invalid="true"]');
          const hasErrors = errorElements.length > 0;
          const errorMessages = Array.from(errorElements).map(el => el.textContent.trim()).filter(txt => txt);

          // Check textarea validation state
          const textareaInvalid = textarea.getAttribute('aria-invalid') === 'true';
          const textareaRequired = textarea.hasAttribute('required') && finalValue.length === 0;

          // Debug validation logic
          const successCondition = valueLength > 0 && !textareaInvalid && !textareaRequired;
          console.log('Fill result - Length:', valueLength, 'Errors:', hasErrors, 'TextareaInvalid:', textareaInvalid, 'Required:', textareaRequired);
          console.log('Success calculation: valueLength > 0:', valueLength > 0, '!textareaInvalid:', !textareaInvalid, '!textareaRequired:', !textareaRequired);
          console.log('Final success result:', successCondition);

          return {
            success: successCondition,
            length: valueLength,
            hasErrors: hasErrors || textareaInvalid || textareaRequired,
            errorMessages: errorMessages,
            actualValue: finalValue.substring(0, 50) + '...',
            textareaInvalid: textareaInvalid,
            textareaRequired: textareaRequired
          };
        }
        return { success: false, error: 'textarea_not_found' };
      `);

      printLog("🔍 Step 7: Evaluating final result...");
      printLog(`🔍 Step 7 DEBUG: textareaResult.success = ${textareaResult.success}`);

      if (textareaResult.success) {
        printLog(`✅ Step 7: SUCCESS! Cover letter filled - Length: ${textareaResult.length}`);
        if (textareaResult.hasErrors) {
          printLog(`⚠️ VALIDATION WARNINGS: ${textareaResult.errorMessages.join(', ')}`);
        }
        printLog("🎉 YIELDING: cover_letter_filled");
        yield "cover_letter_filled";
      } else {
        printLog(`❌ Step 7: FAILURE! Cover letter filling failed: ${textareaResult.error || 'Unknown error'}`);
        if (textareaResult.errorMessages && textareaResult.errorMessages.length > 0) {
          printLog(`🔥 Error messages: ${textareaResult.errorMessages.join(', ')}`);
        }
        printLog("💥 YIELDING: cover_letter_error");
        yield "cover_letter_error";
      }

    } catch (playwrightError) {
      printLog(`❌ Playwright fill failed: ${playwrightError}`);
      throw new Error(`Both AI generation and form filling failed: ${playwrightError}`);
    }

  } catch (error) {
    printLog(`💥 COVER LETTER HANDLER CRASH: ${error}`);
    printLog(`🛑 STAYING PUT FOR MANUAL INSPECTION - Cover letter handler failed`);
    yield "cover_letter_error";
  }
}
