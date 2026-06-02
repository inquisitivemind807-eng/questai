/**
 * Jora Bot Implementation
 * ------------------------------------------------------------------
 * Selenium + Chrome implementation for Jora.com.au.
 *
 * Jora is an Australian job search aggregator — it indexes jobs from
 * Seek, Indeed, company career sites, and other sources. There is no
 * on-platform application form; clicking "Apply" opens the external
 * employer site in a new tab.
 *
 * Architecture:
 *   - Uses Selenium WebDriver with Chrome
 *   - Session persists in sessions/jora/
 *   - Job cards open a side panel (not a new page) for details
 *   - Search URL: au.jora.com/j?q={keywords}&l={location}
 *   - Pagination: URL parameter p=N
 *
 * Workflow YAMLs that use this file:
 *   jora_extract_steps.yaml, jora_extract_pauseconfirm_steps.yaml,
 *   jora_apply_steps.yaml, jora_apply_pauseconfirm_steps.yaml
 */

import { WebDriver, By, until } from 'selenium-webdriver';
import { setupChromeDriver } from '../core/browser_manager';
import { HumanBehavior, StealthFeatures, DEFAULT_HUMANIZATION } from '../core/humanization';
import { UniversalSessionManager, SessionConfigs } from '../core/sessionManager';
import { UniversalOverlay } from '../core/universal_overlay';
import type { WorkflowContext } from '../core/workflow_engine';
import { waitForNextConfirm, waitForNextConfirmAsync } from '../core/pause_confirm';
import { apiRequest } from '../core/api_client';
import { recordJobApplicationToBackend, getJobDirPathFromJobFile } from '../core/job_application_recorder';
import { highlightElement, highlightSelector } from '../core/highlight';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = "https://au.jora.com";

const printLog = (message: string) => {
  console.log(`[DEV] ${message}`);
};

const userLog = (message: string) => {
  console.log(message);
};

// ---------------------------------------------------------------------------
// Selector helpers
// ---------------------------------------------------------------------------

function resolveSelector(selectors: any, path: string): string[] {
  const keys = path.split('.');
  let current = selectors;
  for (const key of keys) {
    if (!current || typeof current !== 'object') return [];
    current = current[key];
  }
  if (Array.isArray(current)) return current;
  if (typeof current === 'string') return [current];
  return [];
}

async function findFirst(driver: WebDriver, selectors: string[]): Promise<any> {
  for (const sel of selectors) {
    try {
      const el = await driver.findElement(By.css(sel));
      return el;
    } catch {
      // ignored
    }
  }
  return null;
}

async function findVisible(driver: WebDriver, selectors: string[]): Promise<any> {
  for (const sel of selectors) {
    try {
      const els = await driver.findElements(By.css(sel));
      for (const el of els) {
        if (await el.isDisplayed()) return el;
      }
    } catch {
      // ignored
    }
  }
  return null;
}

async function findFirstInElement(parent: any, selectors: string[]): Promise<any> {
  for (const sel of selectors) {
    try {
      const el = await parent.findElement(By.css(sel));
      return el;
    } catch {
      // ignored
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

function buildSearchUrl(ctx: any): string {
  const fd = ctx.config?.formData || {};
  const keywords = fd.keywords || '';
  const location = fd.locations || '';

  const params = new URLSearchParams();
  if (keywords) params.set('q', keywords);
  if (location) params.set('l', location);

  return `${BASE_URL}/j?${params.toString()}`;
}

function buildPaginationUrl(ctx: any, page: number): string {
  const fd = ctx.config?.formData || {};
  const keywords = fd.keywords || '';
  const location = fd.locations || '';

  const params = new URLSearchParams();
  if (keywords) params.set('q', keywords);
  if (location) params.set('l', location);
  params.set('p', String(page));

  return `${BASE_URL}/j?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// STEP 0: Initialize browser, session, overlay, context
// ---------------------------------------------------------------------------

export async function* step0(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  if (!ctx.state) ctx.state = {};

  if (!ctx.driver) {
    printLog('Launching Chrome for Jora...');

    const { driver } = await setupChromeDriver('jora');

    await StealthFeatures.hideWebDriver(driver);
    await StealthFeatures.randomizeUserAgent(driver);
    ctx.driver = driver;
    ctx.behavior = new HumanBehavior(driver, DEFAULT_HUMANIZATION);
    ctx.overlay = new UniversalOverlay(driver, 'Jora', {
      showProgress: true,
      showLogs: true,
      showPauseButton: true,
    });

    try {
      await ctx.overlay.showOverlay({
        title: 'Jora Bot',
        html: '<p>Initializing Jora bot...</p>',
        draggable: true,
        collapsible: true,
      });
    } catch (e) {
      printLog(`Overlay init warning: ${e}`);
    }

    printLog('Jora Chrome driver ready.');
  }

  if (ctx.config?.directApplyUrl) {
    userLog('Direct apply URL detected, entering apply pipeline');
    yield 'direct_apply_requested';
    return;
  }

  userLog('Starting Jora extraction pipeline');
  yield 'step0_complete';
}

// ---------------------------------------------------------------------------
// STEP: navigateToDirectApplyUrl
// ---------------------------------------------------------------------------

export async function* navigateToDirectApplyUrl(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const driver: WebDriver = ctx.driver;

  try {
    let jobUrl = ctx.config?.directApplyUrl;
    if (!jobUrl) throw new Error('No Direct Apply URL provided');

    if (jobUrl.startsWith('/')) {
      jobUrl = `${BASE_URL}${jobUrl}`;
    }

    printLog(`Navigating to direct apply URL: ${jobUrl}`);
    await driver.get(jobUrl);
    await driver.sleep(4000);

    const bodyText = await driver.findElement(By.css('body')).getText();
    if (bodyText.includes('not found') || bodyText.includes("doesn't exist")) {
      userLog('Job page not found');
      yield 'job_not_found';
      return;
    }

    if (ctx.overlay) {
      await ctx.overlay.initialize().catch(() => { });
      await ctx.overlay.addLogEvent('Job page loaded').catch(() => { });
    }

    yield 'navigated';
  } catch (error) {
    printLog(`Failed to navigate to direct apply: ${error}`);
    yield 'navigation_failed';
  }
}

// ---------------------------------------------------------------------------
// STEP: openCheckLogin — check if user is signed in at the Jora homepage
// ---------------------------------------------------------------------------

export async function* openCheckLogin(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const driver: WebDriver = ctx.driver;
  printLog('Checking login status on Jora...');

  try {
    await driver.get(BASE_URL);
    await driver.sleep(3000);

    if (ctx.overlay) {
      await ctx.overlay.initialize().catch(() => { });
    }

    const loggedInSelectors = resolveSelector(ctx.selectors, 'auth.loggedInIndicator');
    const profileIcon = await findVisible(driver, loggedInSelectors);

    if (profileIcon) {
      printLog('Profile icon found — user is logged in');
      yield 'login_not_needed';
      return;
    }

    const loginSelectors = resolveSelector(ctx.selectors, 'auth.loginButton');
    const loginBtn = await findVisible(driver, loginSelectors);

    if (loginBtn) {
      printLog('Sign In button found — user needs to log in');
      yield 'user_needs_to_login';
    } else {
      printLog('No profile icon or Sign In button found — assuming logged in');
      yield 'login_not_needed';
    }
  } catch (error) {
    printLog(`Failed checking login: ${error}`);
    yield 'failed_checking_login_status';
  }
}

// ---------------------------------------------------------------------------
// STEP: showManualLoginPrompt — pause for user to log in
// ---------------------------------------------------------------------------

export async function* showManualLoginPrompt(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const driver: WebDriver = ctx.driver;
  printLog('Pausing for manual login on Jora...');
  userLog('ACTION REQUIRED: Please log in to Jora.');

  try {
    if (ctx.overlay) {
      await ctx.overlay.initialize().catch(() => { });
      await ctx.overlay.showSignInOverlay().catch(() => { });
    }

    const signInBtn = await driver.executeScript(() => {
      const links = document.querySelectorAll('a, button, span');
      for (const el of links) {
        const text = el.textContent?.trim().toLowerCase();
        if (text === 'sign in' || text === 'sign in / register' || text === 'log in') {
          return el;
        }
      }
      return null;
    });
    if (signInBtn) {
      await driver.executeScript('arguments[0].style.outline = "3px solid #ff4444"', signInBtn);
      await driver.executeScript('arguments[0].click();', signInBtn);
    }

    // Poll for login: up to ~6 minutes
    let authenticated = false;
    for (let i = 0; i < 120; i++) {
      await driver.sleep(3000);

      try {
        const isConfirmed = await driver.executeScript(
          'return window.__overlaySignInComplete === true || sessionStorage.getItem("overlay_signin_complete") === "true";'
        );
        if (isConfirmed) {
          authenticated = true;
          await driver.executeScript(
            'window.__overlaySignInComplete = false; sessionStorage.removeItem("overlay_signin_complete");'
          );
          break;
        }
      } catch {
        // ignored
      }

      const stillHasSignIn = await driver.executeScript(() => {
        const links = document.querySelectorAll('a, button, span');
        for (const el of links) {
          const text = el.textContent?.trim().toLowerCase();
          if (text === 'sign in' || text === 'sign in / register' || text === 'log in') {
            return true;
          }
        }
        return false;
      });
      if (!stillHasSignIn) {
        authenticated = true;
        break;
      }
    }

    if (authenticated) {
      printLog('Login confirmed, proceeding...');
      if (ctx.config?.directApplyUrl) {
        let url = ctx.config.directApplyUrl;
        if (url.startsWith('/')) url = `${BASE_URL}${url}`;
        await driver.get(url);
        await driver.sleep(4000);
      }
      yield 'login_successful';
    } else {
      printLog('Login timed out');
      yield 'login_failed';
    }
  } catch (error) {
    printLog(`Error during manual login: ${error}`);
    yield 'error_showing_manual_login';
  }
}

// ---------------------------------------------------------------------------
// STEP: openJobsPage — navigate to search results with keywords + location
// ---------------------------------------------------------------------------

export async function* openJobsPage(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const driver: WebDriver = ctx.driver;
  printLog('Navigating to Jora search page...');

  try {
    const url = buildSearchUrl(ctx);
    printLog(`Navigating to: ${url}`);
    await driver.get(url);
    await driver.sleep(4000);

    if (ctx.overlay) {
      const fd = ctx.config?.formData || {};
      const keywords = fd.keywords || '';
      const loc = fd.locations || 'Anywhere';
      await ctx.overlay.initialize().catch(() => { });
      await ctx.overlay.showJobProgress(0, 0, `Searching: ${keywords} in ${loc}`, 1).catch(() => { });
    }

    yield 'jobs_page_loaded';
  } catch (error) {
    printLog(`Failed opening jobs page: ${error}`);
    yield 'failed_opening_jobs_page';
  }
}

// ---------------------------------------------------------------------------
// STEP: getPageInfo — extract result count and pagination info
// ---------------------------------------------------------------------------

export async function* getPageInfo(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const driver: WebDriver = ctx.driver;
  printLog('Counting job cards on this page...');

  ctx.state.currentPage = ctx.state.currentPage || 1;
  ctx.state.scrapedJobs = ctx.state.scrapedJobs || [];

  try {
    const containerSelectors = resolveSelector(ctx.selectors, 'jobCards.container');
    const cardSelectors = resolveSelector(ctx.selectors, 'jobCards.card');
    const cardSel = cardSelectors[0];

    for (const contSel of containerSelectors) {
      try {
        await driver.wait(until.elementLocated(By.css(contSel)), 5000);
        break;
      } catch {
        // try next
      }
    }

    // Scroll down to trigger lazy-loaded cards
    await driver.executeScript('window.scrollTo(0, document.body.scrollHeight)');
    await driver.sleep(2000);
    await driver.executeScript('window.scrollTo(0, 0)');
    await driver.sleep(1000);

    const cards = await driver.findElements(By.css(cardSel));
    const cardCount = cards.length;

    if (cardCount === 0) {
      printLog('No job cards found on this page');
      yield 'pagination_not_found';
      return;
    }

    // Inject numbered badges onto each card
    await driver.executeScript(
      `(function() {
        const cards = document.querySelectorAll(arguments[0]);
        cards.forEach(function(el, i) {
          el.style.outline = '5px solid #00ffff';
          el.style.outlineOffset = '-5px';
          el.style.boxShadow = '0 0 10px #00ffff';
          var style = window.getComputedStyle(el);
          if (style.position === 'static') el.style.position = 'relative';
          var badge = document.createElement('div');
          badge.textContent = i + 1;
          badge.style.cssText = 'position:absolute;top:4px;left:4px;background:#00ffff;color:#000;font-weight:bold;font-size:14px;padding:2px 6px;border-radius:3px;z-index:9999;pointer-events:none;';
          el.insertBefore(badge, el.firstChild);
        });
        return cards.length;
      })()`,
      cardSel
    );

    ctx.state.cardCount = cardCount;
    userLog(`Found ${cardCount} job cards on page ${ctx.state.currentPage}`);

    if (ctx.overlay) {
      await ctx.overlay.addLogEvent(`${cardCount} jobs on this page`).catch(() => { });
    }

    yield 'page_info_extracted';
  } catch (e) {
    printLog(`Failed extracting page info: ${e}`);
    yield 'failed_extracting_page_info';
  }
}

// ---------------------------------------------------------------------------
// STEP: extractJobDetails — scrape all job cards on the current page
//
// Jora is a SPA: clicking a job card opens a side panel on the same page.
// We click the card div (not the title <a>) to open the panel without
// navigating away. Highlights stick because the page never reloads.
// ---------------------------------------------------------------------------

export async function* extractJobDetails(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const driver: WebDriver = ctx.driver;
  const cardCount = ctx.state.cardCount || 0;

  if (cardCount === 0) {
    yield 'no_job_cards_found';
    return;
  }

  printLog(`Extracting ${cardCount} job cards from page ${ctx.state.currentPage}...`);

  try {
    // Re-find cards by selector (getPageInfo already validated the page has cards)
    const cardSelectors = resolveSelector(ctx.selectors, 'jobCards.card');
    const cardSel = cardSelectors[0];
    let cards = await driver.findElements(By.css(cardSel));

    // Guard against stale/reduced card lists
    if (cards.length === 0) {
      cards = await driver.findElements(By.css(cardSel));
    }

    ctx.state.currentJobCards = [];

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      try {
        let title = 'Unknown';
        let company = 'Unknown';
        let jobUrl = '';
        let jobId = `jora_${Date.now()}_${i}`;
        let location = 'Unknown';
        let salary = 'Not listed';
        let postedDate = 'Unknown';
        let jobType = 'Unknown';
        let isQuickApply = false;

        const titleSelectors = resolveSelector(ctx.selectors, 'jobCards.title');
        const titleEl = await findFirstInElement(card, titleSelectors);
        if (titleEl) {
          await highlightElement(driver, titleEl, '#ff00ff');
          title = (await titleEl.getText()).trim();
          try {
            jobUrl = await titleEl.getAttribute('href') || '';
            if (jobUrl.startsWith('/')) jobUrl = `${BASE_URL}${jobUrl}`;
          } catch {
            // ignored
          }
        }

        ctx.overlay
          ?.updateJobProgress(i + 1, cardCount, `Card ${i + 1} of ${cardCount}: ${title}`, 3)
          .catch(() => { });

        const companySelectors = resolveSelector(ctx.selectors, 'jobCards.company');
        const companyEl = await findFirstInElement(card, companySelectors);
        if (companyEl) {
          await highlightElement(driver, companyEl, '#ffff00');
          company = (await companyEl.getText()).trim();
        }

        const locationSelectors = resolveSelector(ctx.selectors, 'jobCards.location');
        const locationEl = await findFirstInElement(card, locationSelectors);
        if (locationEl) {
          await highlightElement(driver, locationEl, '#ffff00');
          location = (await locationEl.getText()).trim();
        }

        const salarySelectors = resolveSelector(ctx.selectors, 'jobCards.salary');
        const salaryEl = await findFirstInElement(card, salarySelectors);
        if (salaryEl) {
          await highlightElement(driver, salaryEl, '#ffff00');
          salary = (await salaryEl.getText()).trim();
        }

        const dateSelectors = resolveSelector(ctx.selectors, 'jobCards.listingDate');
        const dateEl = await findFirstInElement(card, dateSelectors);
        if (dateEl) {
          await highlightElement(driver, dateEl, '#ffff00');
          postedDate = (await dateEl.getText()).trim();
        }

        const jtSelectors = resolveSelector(ctx.selectors, 'jobCards.jobType');
        const jtEl = await findFirstInElement(card, jtSelectors);
        if (jtEl) {
          jobType = (await jtEl.getText()).trim();
        }

        const qaSelectors = resolveSelector(ctx.selectors, 'jobCards.quickApplyBadge');
        const qaEl = await findFirstInElement(card, qaSelectors);
        if (qaEl) {
          isQuickApply = true;
        }

        let description = '';
        let externalApplyUrl: string | null = null;
        const applicationType: 'internal' | 'external' = isQuickApply ? 'internal' : 'external';

        try {
          await driver.executeScript('arguments[0].scrollIntoView({block: "center"});', card);
          await driver.sleep(300);
          await driver.executeScript('arguments[0].click();', card);
          await driver.sleep(2500);

          const descSelectors = resolveSelector(ctx.selectors, 'jobDetails.description');
          const descEl = await findFirst(driver, descSelectors);
          if (descEl) {
            await highlightElement(driver, descEl, '#00ff00');
            description = (await descEl.getText()).trim();
          }

          const applySelectors = resolveSelector(ctx.selectors, 'jobDetails.externalApplyButton');
          const applyEl = await findFirst(driver, applySelectors);
          if (applyEl) {
            await highlightElement(driver, applyEl, '#ff00ff');
            try {
              externalApplyUrl = await applyEl.getAttribute('href') || null;
            } catch {
              // ignored
            }
          }
        } catch (e) {
          printLog(`Could not open side panel for ${title}: ${e}`);
        }

        const job = {
          title,
          company,
          location,
          salary,
          postedDate,
          url: jobUrl,
          jobId,
          description,
          jobType,
          applicationType,
          externalApplyUrl,
          isQuickApply,
          platform: 'jora',
        };
        ctx.state.currentJobCards.push(job);

        try {
          const result = await apiRequest('/api/scraped-jobs', 'POST', {
            ...job,
            platformJobId: job.jobId,
            rawData: { ...job },
          });

          if (result && result.success) {
            printLog(`Saved job: ${title}`);
            if (ctx.overlay) {
              await ctx.overlay.addLogEvent(`Saved: ${title}`).catch(() => { });
            }
          } else {
            printLog(`Failed to save job: ${title}`);
          }
        } catch (saveError) {
          printLog(`Error saving job: ${title}: ${saveError}`);
        }
      } catch (e) {
        printLog(`Error extracting job card ${i + 1}: ${e}`);
      }

      const isPauseMode =
        (ctx.bot_name || '').includes('pauseconfirm') ||
        ctx.config?.botMode === 'pauseconfirm' ||
        ctx.config?.formData?.botMode === 'pauseconfirm';

      if (isPauseMode) {
        const nextLabel =
          i + 1 < cards.length ? `Next Job (${i + 2}/${cards.length})` : 'Finish Extraction Batch';
        printLog(`Pausing between jobs (${i + 1}/${cards.length})`);

        if (ctx.overlay) {
          await ctx.overlay.initialize().catch(() => { });
          const lastJob = ctx.state.currentJobCards[ctx.state.currentJobCards.length - 1];
          await ctx.overlay
            .addLogEvent(`Paused after: ${lastJob?.title || 'extraction'}`)
            .catch(() => { });
        }

        await waitForNextConfirmAsync(ctx, nextLabel);
      }
    }

    yield 'proceed_to_process_jobs';
  } catch (error) {
    printLog(`Error extracting job details: ${error}`);
    yield 'failed_extracting_jobs';
  }
}

// ---------------------------------------------------------------------------
// STEP: processJobs — accumulate batch
// ---------------------------------------------------------------------------

export async function* processJobs(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  if (!ctx.state.scrapedJobs) ctx.state.scrapedJobs = [];
  ctx.state.scrapedJobs = ctx.state.scrapedJobs.concat(ctx.state.currentJobCards || []);
  const processed = ctx.state.currentJobCards?.length || 0;
  const pageCount = ctx.state.cardCount || processed;
  printLog(`Job batch sync complete. Total accumulated: ${ctx.state.scrapedJobs.length}`);

  ctx.overlay
    ?.updateJobProgress(processed, pageCount, `Processed ${processed} jobs from this page`, 4)
    .catch(() => { });

  yield 'jobs_saved';
}

// ---------------------------------------------------------------------------
// Apply pipeline steps
// ---------------------------------------------------------------------------

/**
 * Attempt to find the "Apply" button on a Jora job detail page.
 * Jora is an aggregator — the Apply button links to the external
 * employer site. There is no on-platform application form.
 */
export async function* attemptEasyApply(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const driver: WebDriver = ctx.driver;
  printLog('Looking for Apply button on Jora job page...');

  try {
    await driver.sleep(3000);

    const applySelectors = resolveSelector(ctx.selectors, 'jobDetails.externalApplyButton');
    const applyBtn = await findVisible(driver, applySelectors);

    if (applyBtn) {
      await driver.executeScript('arguments[0].scrollIntoView({block: "center"});', applyBtn);
      await driver.sleep(500);
      await highlightElement(driver, applyBtn, '#00ff00');
      ctx.state.externalApplyUrl = await applyBtn.getAttribute('href');
      printLog(`Found external apply URL: ${ctx.state.externalApplyUrl}`);
      yield 'modal_opened_successfully';
    } else {
      printLog('Apply button not found — may be an expired listing');
      yield 'no_easy_apply_button_found';
    }
  } catch (error) {
    printLog(`Failed to find Apply button: ${error}`);
    yield 'failed_to_click_easy_apply';
  }
}

/**
 * Jora does not have an on-platform application form.
 * This step is a no-op — always transitions to submit.
 */
export async function* answerQuestions(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  printLog('Jora has no on-platform questions to answer. Proceeding...');
  yield 'finished_answering_questions';
}

/**
 * Transition step for the submit flow.
 */
export async function* submitApplication(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  printLog('Finishing Jora application submission flow.');
  yield 'save_applied_job';
}

/**
 * Record the job application to the backend.
 * Since Jora is an aggregator, the "application" is really just
 * recording that we navigated to the external apply URL.
 */
export async function* saveAppliedJob(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  printLog('Recording Jora job application to backend...');

  try {
    const driver: WebDriver = ctx.driver;
    const jobId = ctx.config?.jobId || ctx.state?.currentJobId || `jora_${Date.now()}`;
    const jobFilePath = path.join(process.cwd(), 'src', 'bots', 'jora', 'jobs', `${jobId}.json`);
    const jobDirPath = getJobDirPathFromJobFile(jobFilePath, jobId);

    if (!fs.existsSync(jobFilePath)) {
      const dir = path.dirname(jobFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const currentUrl = await driver.getCurrentUrl();
      const minimalJob = {
        jobId,
        platform: 'jora',
        title: ctx.state?.currentJobTitle || 'Jora Job',
        company: ctx.state?.currentJobCompany || 'Unknown Company',
        url: currentUrl,
        externalApplyUrl: ctx.state?.externalApplyUrl || null,
        timestamp: new Date().toISOString(),
      };
      fs.writeFileSync(jobFilePath, JSON.stringify(minimalJob, null, 2));
    }

    const result = await recordJobApplicationToBackend({
      jobFilePath,
      jobDirPath,
      platform: 'jora',
    });

    if (result.ok) {
      printLog(`Recorded application to DB (ID: ${result.id})`);
      if (ctx.overlay) {
        await ctx.overlay.addLogEvent('Application recorded successfully').catch(() => { });
      }
    } else {
      printLog(`Failed to record application: ${result.error}`);
    }
  } catch (error) {
    printLog(`Error in saveAppliedJob: ${error}`);
  }

  yield 'finish';
}

/**
 * Handle external (off-platform) applications.
 * Opens the external link in a new tab for the user.
 */
export async function* externalApply(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const driver: WebDriver = ctx.driver;
  printLog('Opening external apply URL for Jora job...');

  try {
    if (ctx.state?.externalApplyUrl) {
      printLog(`Opening external URL: ${ctx.state.externalApplyUrl}`);
      await driver.get(ctx.state.externalApplyUrl);
      await driver.sleep(3000);
    }
  } catch (error) {
    printLog(`Failed to open external apply link: ${error}`);
  }

  yield 'application_failed';
}

/**
 * Mark the current application attempt as failed.
 */
export async function* applicationFailed(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  printLog('Jora application flow hit a roadblock.');
  yield 'application_marked_failed';
}

// ---------------------------------------------------------------------------
// STEP: navigateToNextPage — go to the next page of results
// ---------------------------------------------------------------------------

export async function* navigateToNextPage(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const driver: WebDriver = ctx.driver;
  printLog('Proceeding to next page of Jora results...');

  try {
    const nextPage = (ctx.state.currentPage || 1) + 1;
    const url = buildPaginationUrl(ctx, nextPage);

    printLog(`Navigating to page ${nextPage}: ${url}`);
    await driver.get(url);
    await driver.sleep(5000);

    ctx.state.currentPage = nextPage;

    // Check if the new page still has job cards
    const cardSelectors = resolveSelector(ctx.selectors, 'jobCards.card');
    const cards = await driver.findElements(By.css(cardSelectors[0]));

    if (cards.length > 0) {
      printLog(`Page ${nextPage} has ${cards.length} job cards`);
      yield 'extract_job_details';
    } else {
      printLog('No more job cards — extraction complete');
      yield 'finish';
    }
  } catch (error) {
    printLog(`Pagination error: ${error}`);
    yield 'finish';
  }
}

// ---------------------------------------------------------------------------
// STEP: finish — cleanup
// ---------------------------------------------------------------------------

export async function* finish(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  printLog(`Jora workflow finished. Scraped total: ${ctx.state?.scrapedJobs?.length || 0}`);

  if (ctx.driver && ctx.config?.keep_open !== true) {
    setTimeout(async () => {
      try {
        await ctx.driver.quit();
      } catch {
        // ignored
      }
    }, 2000);
  }

  yield 'done';
}

export { waitForNextConfirm } from '../core/pause_confirm';
