import { WebDriver } from 'selenium-webdriver';
import { setupChromeDriver } from '../../core/browser_manager';
import { HumanBehavior, StealthFeatures, DEFAULT_HUMANIZATION } from '../../core/humanization';
import { UniversalSessionManager, SessionConfigs } from '../../core/sessionManager';
import type { WorkflowContext } from '../../core/workflow_engine';
import { getCurrentStep } from '../seek_impl';
import { handleResumeSelection } from '../handlers/resume_handler';
import { handleCoverLetter } from '../handlers/cover_letter_handler';
import { answerEmployerQuestions } from '../handlers/answer_employer_questions';

const printLog = (message: string) => {
  console.log(`[QUICK APPLY TEST] ${message}`);
};

// Test URLs for Quick Apply
const TEST_URLS = [
  'https://www.seek.com.au/job/87119743/apply/role-requirements?sol=86a646b661f5c873ba3bc551361f849c1d927680'
];


// Main execution function
async function runQuickApplyTests(): Promise<void> {
  printLog("Starting Quick Apply Flow Tests");

  // Initialize context once and reuse for all tests
  const { driver, sessionExists, sessionsDir } = await setupChromeDriver('seek');

  const ctx: WorkflowContext = {
    driver,
    sessionExists,
    sessionsDir,
    humanBehavior: new HumanBehavior(DEFAULT_HUMANIZATION),
    sessionManager: new UniversalSessionManager(driver, SessionConfigs.seek)
  };

  // Apply stealth features
  await StealthFeatures.hideWebDriver(driver);
  await StealthFeatures.randomizeUserAgent(driver);

  if (sessionExists) {
    printLog("Using existing seek session with login state");
  } else {
    printLog("No existing session found - you may need to log in manually");
  }

  try {
    for (let i = 0; i < TEST_URLS.length; i++) {
      const url = TEST_URLS[i];
      printLog(`\n=== TESTING QUICK APPLY FLOW FOR: ${url} ===`);

      // Navigate to the Quick Apply URL
      printLog(`Navigating to: ${url}`);
      await driver.get(url);
      await driver.sleep(5000); // Wait for page load

      // Check current URL and page title
      const currentUrl = await driver.getCurrentUrl();
      const pageTitle = await driver.getTitle();
      printLog(`Current URL: ${currentUrl}`);
      printLog(`Page Title: ${pageTitle}`);

      // Check if we got redirected or if job is unavailable
      if (!currentUrl.includes('/apply') || pageTitle.toLowerCase().includes('error') || pageTitle === 'SEEK') {
        printLog(`⚠️ Job may be unavailable or expired - skipping this URL`);
        printLog(`   Expected URL pattern: */apply`);
        printLog(`   Actual URL: ${currentUrl}`);
        printLog(`   Page title: ${pageTitle}`);
      } else {
        // Run the Quick Apply flow
        await runQuickApplyFlowSteps(ctx);
      }

      printLog(`\n=== COMPLETED TESTING FOR: ${url} ===`);

      // Wait between tests (except for the last one)
      if (i < TEST_URLS.length - 1) {
        printLog("\nWaiting 5 seconds before next test...\n");
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    printLog("All Quick Apply tests completed");
    printLog("🎯 Tests finished! Browser remains open for manual inspection.");
    printLog("💡 Press Ctrl+C to exit (browser will stay open) or close browser manually");

  } catch (error) {
    printLog(`Error during tests: ${error}`);
  }
  // Note: Browser is kept open for manual inspection
}

// Separate function to run the Quick Apply steps
async function runQuickApplyFlowSteps(ctx: WorkflowContext): Promise<void> {
  // Step 1: Get current step in the flow
  printLog("\n--- Step 1: Getting current step ---");
  for await (const result of getCurrentStep(ctx)) {
    printLog(`Current step result: ${result}`);

    if (result === "current_step_choose_documents") {
      printLog("On Choose Documents step - handling cover letter and resume");

      // Handle cover letter
      printLog("\n--- Step 2: Handling cover letter ---");
      for await (const coverResult of handleCoverLetter(ctx)) {
        printLog(`Cover letter result: ${coverResult}`);
        break; // Take first result
      }

      // Handle resume selection
      printLog("\n--- Step 3: Handling resume selection ---");
      for await (const resumeResult of handleResumeSelection(ctx)) {
        printLog(`Resume selection result: ${resumeResult}`);
        break; // Take first result
      }

      // PAUSE BRIEFLY FOR COVER LETTER INSPECTION
      printLog("\n--- SHORT PAUSE TO READ COVER LETTER ---");
      printLog("📄 COVER LETTER FILLED - Quickly review the generated content");
      printLog("⏸️  Brief pause for you to review the cover letter...");
      printLog("🔍 Check the cover letter quality and personalization");

      // Short pause for cover letter inspection
      printLog("\n⏳ Starting short inspection period...");
      await ctx.driver.sleep(2000); // 2 seconds

      printLog("⏰ Inspection pause complete!");

    } else if (result === "current_step_employer_questions") {
      printLog("Already on Employer Questions step");
      for await (const questionsResult of answerEmployerQuestions(ctx)) {
        printLog(`Employer questions result: ${questionsResult}`);
        break; // Take first result
      }
    } else {
      printLog(`Unexpected step: ${result}`);
    }

    break; // Take first result
  }
}

// Run the tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runQuickApplyTests().catch(error => {
    console.error("Test execution failed:", error);
    process.exit(1);
  });
}

export { runQuickApplyTests };