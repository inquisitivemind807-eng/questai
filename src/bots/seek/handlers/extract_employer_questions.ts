import type { WorkflowContext } from '../../core/workflow_engine';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const printLog = (message: string) => {
  console.log(message);
};

// Handle Employer Questions - Detect and Save Questions
export async function* extractEmployerQuestions(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    printLog("Scanning for employer questions...");

    const scriptPath = path.join(__dirname, '../scripts/browser_question_extractor.js');
    const browserScript = fs.readFileSync(scriptPath, 'utf8');

    // Wait for dynamic content to load
    await ctx.driver.sleep(3000);

    const questionsData = await ctx.driver.executeScript(browserScript);

    if (questionsData && questionsData.questionsFound > 0) {
      printLog(`Found ${questionsData.questionsFound} employer questions`);

      let existingJobData = {};
      if (ctx.currentJobFile) {
        try {
          const existingData = fs.readFileSync(ctx.currentJobFile, 'utf8');
          existingJobData = JSON.parse(existingData);
        } catch (error) {
          printLog(`Could not load existing job data: ${error}`);
        }
      }

      // Create a clean format for questions
      const cleanQuestions = questionsData.questions.map((q: any, index: number) => ({
        id: index,
        q: q.question,
        type: q.type,
        opts: q.options || [], // Browser script already returns a clean string array
        containerSelector: q.containerSelector
      }));

      const updatedJobData = {
        ...existingJobData,
        questions: cleanQuestions,
        lastUpdated: new Date().toISOString()
      };

      if (ctx.currentJobFile) {
        fs.writeFileSync(ctx.currentJobFile, JSON.stringify(updatedJobData, null, 2));
        printLog(`Updated job file with ${questionsData.questionsFound} employer questions: ${ctx.currentJobFile}`);
      }

      yield "employer_questions_saved";
    } else {
      printLog("No employer questions found on this page");
      yield "no_employer_questions";
    }

  }
  catch (error) {
    printLog(`Employer questions handling error: ${error}`);
    yield "employer_questions_error";
  }
}