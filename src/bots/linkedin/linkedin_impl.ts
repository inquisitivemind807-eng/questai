import { WebDriver, By, until, Key, error } from 'selenium-webdriver';
import { setupChromeDriver } from '../core/browser_manager';
import { HumanBehavior, StealthFeatures, DEFAULT_HUMANIZATION } from '../core/humanization';
import { UniversalSessionManager, SessionConfigs } from '../core/sessionManager';
import { UniversalOverlay } from '../core/universal_overlay';
import type { WorkflowContext } from '../core/workflow_engine';
import { recordJobApplicationToBackend } from '../core/job_application_recorder';
import { getJobArtifactDir, getClientEmailFromContext } from '../core/client_paths';
import { logger } from '../core/logger';
import { getIntelligentAnswers } from '../seek/handlers/intelligent_qa_handler';
import { fillQuestionFieldDetailed } from '../seek/handlers/answer_employer_questions';
import { Document, Paragraph, TextRun, Packer } from 'docx';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { readCanonicalResumeText } from '../../lib/canonical-resume';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const printLog = (message: string) => {
  console.log(message);
};

function parseLinkedInJobId(rawUrl: string | undefined): string {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    const pathMatch = parsed.pathname.match(/\/jobs\/view\/(\d+)/);
    if (pathMatch?.[1]) return pathMatch[1];
    const queryId = parsed.searchParams.get('currentJobId') || parsed.searchParams.get('jobId');
    return queryId || '';
  } catch {
    const fallbackMatch = String(rawUrl).match(/\/jobs\/view\/(\d+)/);
    return fallbackMatch?.[1] || '';
  }
}

function getLinkedInExtractLimit(ctx: WorkflowContext): number {
  const cfg: any = (ctx as any)?.config || {};
  const candidates = [
    cfg.maxJobsToProcess,
    cfg.extractLimit,
    cfg.extract_limit,
    cfg?.formData?.maxJobsToProcess,
    cfg?.formData?.extractLimit
  ];
  for (const raw of candidates) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return 0;
}

function getLinkedInOverlayProgress(ctx: WorkflowContext): { done: number; total: number } {
  const done = Number((ctx as any).jobs_extracted || 0);
  const configuredTotal = getLinkedInExtractLimit(ctx);
  const runtimeTotal = Number((ctx as any).total_jobs || 0);
  const total = configuredTotal > 0 ? configuredTotal : runtimeTotal;
  return { done, total: total > 0 ? total : 0 };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizeComparableText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cleanLocation(location: string): { cleanedLocation: string, workplaceType?: string } {
  if (!location) return { cleanedLocation: '' };
  
  const workplaceKeywords = [/Remote/i, /Hybrid/i, /On-site/i, /Onsite/i];
  let workplaceType: string | undefined;
  
  let cleaned = location;
  for (const kw of workplaceKeywords) {
    if (kw.test(cleaned)) {
      const match = cleaned.match(kw);
      if (match) {
        workplaceType = match[0];
        // Remove the keyword and any surrounding separators (·, -, space)
        cleaned = cleaned.replace(new RegExp(`\\s*(?:·|\\-|\\/|\\-|\\|)?\\s*${kw.source}\\s*(?:·|\\-|\\/|\\-|\\|)?\\s*`, 'i'), ' ').trim();
      }
    }
  }
  
  // Clean up any double spaces or trailing separators
  cleaned = cleaned.replace(/\s+/g, ' ').replace(/^[\s·\-\/]+|[\s·\-\/]+$/g, '').trim();
  
  return { cleanedLocation: cleaned, workplaceType };
}

function isLikelySameText(a: string, b: string): boolean {
  const left = normalizeComparableText(a);
  const right = normalizeComparableText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  const leftTokens = left.split(' ').filter(Boolean);
  const rightTokens = right.split(' ').filter(Boolean);
  if (!leftTokens.length || !rightTokens.length) return false;

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  let shared = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) shared += 1;
  }

  const minSize = Math.min(leftSet.size, rightSet.size);
  // For short titles (1-3 tokens), require all tokens from the shorter side to be present.
  // For longer titles, use the 60% overlap threshold.
  const threshold = minSize <= 3 ? (shared >= minSize ? 1 : 0) : 0.6;
  const overlapRatio = shared / minSize;
  if (threshold === 1 ? shared >= minSize : overlapRatio >= threshold) return true;

  const leftPrefix = left.slice(0, 28);
  const rightPrefix = right.slice(0, 28);
  return Boolean(leftPrefix) && leftPrefix === rightPrefix;
}

async function waitForLinkedInPanelSync(
  driver: WebDriver,
  selectors: any,
  expected: { job_id?: string; title?: string; company?: string },
  timeoutMs: number = 9000
): Promise<{ synced: boolean; lastSnapshot: { urlJobId: string; panelJobId: string; panelTitle: string; panelCompany: string; ariaCurrent: string } }> {
  const started = Date.now();
  const titleSelector = selectors?.title_css || 'div.job-details-jobs-unified-top-card__job-title h1';
  const companySelector = selectors?.company_name_css || 'div.job-details-jobs-unified-top-card__company-name a';
  const panelContainers = [
    selectors?.container_css || 'div.jobs-details__main-content',
    'div.jobs-search__job-details',
    'div.jobs-search__job-details--wrapper',
    'div.job-details-jobs-unified-top-card__container--two-pane'
  ];

  let lastSnapshot = { urlJobId: '', panelJobId: '', panelTitle: '', panelCompany: '', ariaCurrent: '' };
  let iterations = 0;

  while (Date.now() - started < timeoutMs) {
    iterations++;
    try {
      const currentUrl = await driver.getCurrentUrl().catch(() => '');
      const urlJobId = parseLinkedInJobId(currentUrl);
      lastSnapshot.urlJobId = urlJobId;
      if (expected.job_id && urlJobId && String(urlJobId) === String(expected.job_id)) {
        return { synced: true, lastSnapshot };
      }

      // Extract job ID scoped to the details panel container, not the entire page.
      const panelJobId = await driver.executeScript(`
        var panelContainers = ${JSON.stringify(panelContainers)};
        var panel = null;
        for (var i = 0; i < panelContainers.length; i++) {
          panel = document.querySelector(panelContainers[i]);
          if (panel) break;
        }
        if (panel) {
          var links = panel.querySelectorAll('a[href*="/jobs/view/"]');
          for (var j = 0; j < links.length; j++) {
            var m = String(links[j].getAttribute('href') || '').match(/\\/jobs\\/view\\/(\\d+)/);
            if (m && m[1]) return m[1];
          }
          // Check data attributes on the panel or its children
          var dataEl = panel.querySelector('[data-job-id]') || panel.closest('[data-job-id]');
          if (dataEl) return dataEl.getAttribute('data-job-id') || '';
        }
        // Fallback: aria-current card in the list (LinkedIn's own "selected" signal)
        var selected = document.querySelector('li[data-occludable-job-id][aria-current="true"], li[data-job-id][aria-current="true"], li.jobs-search-results__list-item--active');
        if (selected) {
          return selected.getAttribute('data-occludable-job-id') || selected.getAttribute('data-job-id') || '';
        }
        return '';
      `).catch(() => '') as string;
      lastSnapshot.panelJobId = panelJobId;
      if (expected.job_id && panelJobId && String(panelJobId) === String(expected.job_id)) {
        return { synced: true, lastSnapshot };
      }

      // Also check aria-current independently for the expected card
      const ariaCurrent = await driver.executeScript(`
        var el = document.querySelector('li[data-occludable-job-id="${expected.job_id}"], li[data-job-id="${expected.job_id}"]');
        return el ? (el.getAttribute('aria-current') || '') : '';
      `).catch(() => '') as string;
      lastSnapshot.ariaCurrent = ariaCurrent;
      if (expected.job_id && ariaCurrent === 'true') {
        return { synced: true, lastSnapshot };
      }

      let panelTitle = '';
      let panelCompany = '';
      try {
        panelTitle = (await (await driver.findElement(By.css(titleSelector))).getText()).trim();
      } catch {
        panelTitle = '';
      }
      try {
        panelCompany = (await (await driver.findElement(By.css(companySelector))).getText()).trim();
      } catch {
        panelCompany = '';
      }
      lastSnapshot.panelTitle = panelTitle;
      lastSnapshot.panelCompany = panelCompany;

      const titleMatches = expected.title ? isLikelySameText(panelTitle, expected.title) : Boolean(panelTitle);
      const companyMatches = expected.company ? isLikelySameText(panelCompany, expected.company) : true;
      if (titleMatches && companyMatches) {
        return { synced: true, lastSnapshot };
      }
    } catch {
      // continue polling
    }
    await driver.sleep(300);
  }

  printLog(`⚠️ Panel sync failed after ${iterations} iterations (${Date.now() - started}ms). Expected: job_id=${expected.job_id}, title="${expected.title}", company="${expected.company}". Got: urlJobId=${lastSnapshot.urlJobId}, panelJobId=${lastSnapshot.panelJobId}, panelTitle="${lastSnapshot.panelTitle}", panelCompany="${lastSnapshot.panelCompany}", ariaCurrent=${lastSnapshot.ariaCurrent}`);

  return { synced: false, lastSnapshot };
}

// #region agent log
const DEBUG_LOG = (location: string, message: string, data: Record<string, unknown>, hypothesisId: string) => {
  const payload = { location, message, data, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId };
  fetch('http://127.0.0.1:7242/ingest/e1922693-d436-4aba-b2d8-ded81d139fea', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => { });
  try {
    const line = JSON.stringify(payload) + '\n';
    const logDir = path.join(process.cwd(), '.cursor');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'debug.log'), line);
    fs.appendFileSync(path.join(__dirname, 'linkedin-debug.log'), line);
  } catch (_) { }
};
// #endregion

/**
 * Dismiss common LinkedIn overlays (cookie banner, modals) that block the search form.
 */
async function dismissLinkedInOverlays(driver: WebDriver): Promise<void> {
  const dismissSelectors = [
    "button[data-test-id='dialog-primary-action-btn']", // LinkedIn dialog primary action
    "button[aria-label='Dismiss']",
    "button[aria-label='Close']",
    ".artdeco-modal__dismiss",
    "button.artdeco-modal__dismiss",
    "[data-test-modal-close-btn]",
    "//button[contains(., 'Accept') or contains(., 'Reject') or contains(., 'Accept all') or contains(., 'Reject all')]",
    "//button[contains(., 'Dismiss') or contains(., 'Got it') or contains(., 'Maybe later')]"
  ];
  for (const sel of dismissSelectors) {
    try {
      const el = sel.startsWith('//') ? await driver.findElement(By.xpath(sel)) : await driver.findElement(By.css(sel));
      if (el) {
        await el.click();
        await driver.sleep(500);
        printLog(`Dismissed overlay via: ${sel.substring(0, 50)}...`);
      }
    } catch {
      // Element not present, continue
    }
  }
}

/**
 * Robust wait and click that safely navigates LinkedIn's dynamic DOM.
 * Instead of waiting for page navigation load, we wait for target interactability.
 * Handles stale elements with retries to account for SPAs.
 * Adds a small delay for Svelte/React hydration interactions.
 * Accounts for LinkedIn skeletons/overlays.
 */
export async function waitAndClick(
  driver: WebDriver,
  locator: By | string,
  timeoutMs: number = 10000
): Promise<void> {
  const loc = typeof locator === 'string' ? By.css(locator) : locator;

  // 1. Wait for global LinkedIn spinners/skeletons to disappear
  try {
    const skeletons = By.css('.artdeco-skeleton-loader, .artdeco-button--loading');
    await driver.wait(async () => {
      const elements = await driver.findElements(skeletons);
      return elements.length === 0;
    }, 5000);
  } catch {
    // Ignore timeout if spinner was never there or didn't disappear in time
  }

  const maxRetries = 3;
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Find and wait for visibility & interactability
      const element = await driver.wait(until.elementLocated(loc), timeoutMs);
      await driver.wait(until.elementIsVisible(element), timeoutMs);
      await driver.wait(until.elementIsEnabled(element), timeoutMs);

      // Ensure element is actually scrolled into view (bypasses sticky headers/footers)
      await driver.executeScript("arguments[0].scrollIntoView({block: 'center'});", element);

      // Add a small delay for Svelte/React hydration (Crucial for handling modern SPA components)
      await driver.sleep(200);

      // Attempt Click
      await element.click();
      return; // Success!

    } catch (err: any) {
      if (err instanceof error.StaleElementReferenceError) {
        // DOM changed beneath us, retry the loop
        printLog(`[Warning] Stale element on ${loc}, retrying...`);
        continue;
      }
      else if (err instanceof error.ElementClickInterceptedError) {
        // Something is blocking it (like the LinkedIn Messaging tab or cookie banner)
        printLog(`[Warning] Click intercepted on ${loc}, attempting JS force click...`);
        // Fallback: Execute a Javascript click directly on the DOM node
        const element = await driver.findElement(loc).catch(() => null);
        if (element) {
          await driver.executeScript("arguments[0].click();", element);
          return;
        }
      }
      else {
        // Propagate non-recoverable errors (like TimeoutError)
        throw err;
      }
    }
  }
  throw new Error(`Failed to click ${loc} after ${maxRetries} retries due to Stale Elements.`);
}

/**
 * Wait for the jobs page search form to be present and ready, dismiss overlays if needed.
 */
async function waitForJobsSearchFormReady(driver: WebDriver, selectors: { jobs?: { keywords_input_candidates?: string[]; location_input_candidates?: string[] } }): Promise<boolean> {
  const keywordCandidates = selectors?.jobs?.keywords_input_candidates ?? [];
  const locationCandidates = selectors?.jobs?.location_input_candidates ?? [];
  const allCandidates = [...keywordCandidates, ...locationCandidates];
  // Reduced from 6 attempts to 3 — the old 6×(3s wait + 2s sleep) = 30s could eat
  // the entire workflow step timeout before this function even returned.
  const maxAttempts = 3;
  const attemptDelay = 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Dismiss overlays that might be covering the form
    await dismissLinkedInOverlays(driver);

    for (const selector of allCandidates) {
      try {
        const el = await driver.wait(until.elementLocated(By.css(selector)), 2000);
        const isDisplayed = await el.isDisplayed();
        if (el && isDisplayed) {
          printLog(`Jobs search form ready (attempt ${attempt}): found ${selector.substring(0, 50)}`);
          return true;
        }
      } catch {
        continue;
      }
    }

    if (attempt < maxAttempts) {
      printLog(`Search form not ready, attempt ${attempt}/${maxAttempts}, waiting...`);
      await driver.sleep(attemptDelay);
    }
  }
  return false;
}



// Open LinkedIn and check login status
export async function* openCheckLogin(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    // Only setup Chrome if driver doesn't exist yet
    if (!ctx.driver) {
      const { driver, sessionExists, sessionsDir } = await setupChromeDriver('linkedin');
      ctx.driver = driver;
      ctx.sessionExists = sessionExists;
      ctx.sessionsDir = sessionsDir;
      ctx.humanBehavior = new HumanBehavior(DEFAULT_HUMANIZATION);
      ctx.sessionManager = new UniversalSessionManager(driver, SessionConfigs.linkedin);
      ctx.overlay = new UniversalOverlay(driver, 'LinkedIn');

      // Show overlay immediately — before any navigation so the user sees it right away
      await ctx.overlay.initialize();
      await ctx.overlay.showJobProgress(0, 0, 'Starting LinkedIn bot...', 0);

      await StealthFeatures.hideWebDriver(driver);
      await StealthFeatures.randomizeUserAgent(driver);
    }

    const jobsUrl = ctx.selectors?.urls?.jobs_url || 'https://www.linkedin.com/jobs/';

    // Check current URL first - don't navigate if already on LinkedIn
    let currentUrl = await ctx.driver.getCurrentUrl();

    if (!currentUrl.includes('linkedin.com') || currentUrl === 'data:,') {
      printLog(`Navigating to: ${jobsUrl}`);
      await ctx.driver.get(jobsUrl);
      await ctx.driver.sleep(2000);
      currentUrl = await ctx.driver.getCurrentUrl();
    } else {
      printLog(`Already on LinkedIn: ${currentUrl}`);
    }

    const title = await ctx.driver.getTitle();
    printLog(`Current URL: ${currentUrl}`);
    printLog(`Page title: ${title}`);

    // Check if we're on the jobs page (logged in) or redirected to login
    if (currentUrl.includes('/login') || currentUrl.includes('/uas/login')) {
      printLog("Redirected to login - user needs to log in");
      yield "user_needs_to_login";
      return;
    }

    // Check if we're on jobs page (indicates logged in)
    if (currentUrl.includes('/jobs')) {
      printLog("Already on jobs page - logged in");
      yield "login_not_needed";
      return;
    }

    // Check for sign-in indicators in page content
    const pageSource = await ctx.driver.getPageSource();
    if (pageSource.includes('Sign in') || pageSource.includes('Join now')) {
      printLog("Sign-in indicators found - user needs to log in");
      yield "user_needs_to_login";
    } else {
      printLog("Login status unclear, proceeding");
      yield "cannot_determine_login_status";
    }
  } catch (error) {
    printLog(`Error checking login: ${error}`);
    yield "failed_to_navigate";
  }
}

// Attempt credential login (skipped - users login manually like Seek)
export async function* credentialLogin(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  printLog("Skipping credential login - users login manually");

  // Always skip to manual login since users login manually like Seek
  printLog("Proceeding to manual login prompt");
  yield "no_login_credentials_found";
}

// Show manual login prompt
export async function* showManualLoginPrompt(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  printLog("Showing manual login prompt");

  try {
    await ctx.overlay.showSignInOverlay();
    printLog("Manual login prompt shown");
    yield "prompt_displayed_to_user";
  } catch (error) {
    printLog(`Error showing manual login prompt: ${error}`);
    yield "error_showing_manual_login";
  }
}

// Open jobs page (navigate to search URL when keywords/location set so search bar is present)
export async function* openJobsPage(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    const driver = ctx.driver;
    const selectors = ctx.selectors;
    const keywords = (ctx.config?.formData?.keywords || '').trim();
    const location = (ctx.config?.formData?.locations || '').trim();
    const baseSearchUrl = selectors?.urls?.jobs_search_url || 'https://www.linkedin.com/jobs/search/';
    const jobsHomeUrl = selectors?.urls?.jobs_url || 'https://www.linkedin.com/jobs/';

    let targetUrl: string;
    if (keywords) {
      const params = new URLSearchParams();
      params.set('keywords', keywords);
      if (location) params.set('location', location);
      targetUrl = `${baseSearchUrl}?${params.toString()}`;
    } else {
      targetUrl = jobsHomeUrl;
    }

    const currentUrl = await driver.getCurrentUrl();
    const alreadyOnSearch = currentUrl.includes('/jobs/search') && (keywords ? currentUrl.includes(encodeURIComponent(keywords)) : true);
    if (!currentUrl.includes('/jobs') || !alreadyOnSearch) {
      printLog(`Navigating to: ${targetUrl}`);
      try {
        await withTimeout(driver.get(targetUrl), 15000, 'Jobs page navigation');
      } catch (err) {
        // With pageLoadStrategy='eager', it might timeout on some resources but still have DOM ready.
        printLog(`Navigation timeout detected but proceeding to check target element presence.`);
      }
      // Small sleep just to allow initial JS evaluation
      await driver.sleep(1000);
    }

    // Wait for search form to be present and dismiss any overlays blocking it
    const formReady = await waitForJobsSearchFormReady(driver, selectors);
    if (!formReady) {
      // If the URL already has our keywords/location baked in (we navigated directly),
      // it is safe to proceed — job cards will load asynchronously anyway.
      const currentUrlCheck = await driver.getCurrentUrl().catch(() => '');
      const hasKeywordsInUrl = keywords ? currentUrlCheck.includes(encodeURIComponent(keywords)) : true;
      if (!hasKeywordsInUrl) {
        printLog('Search form not found and URL does not contain keywords - retrying.');
        yield 'failed_opening_jobs_page';
        return;
      }
      printLog('Search form not visible but URL is correct — proceeding to next step.');
    }

    {
      const progress = getLinkedInOverlayProgress(ctx);
      await ctx.overlay.showJobProgress(progress.done, progress.total, "Initializing LinkedIn bot...", 5);
    }

    yield "jobs_page_loaded";
  } catch (error) {
    printLog(`Error opening jobs page: ${error instanceof Error ? error.message : String(error)}`);
    yield "failed_opening_jobs_page";
  }
}

// Set search location
export async function* setSearchLocation(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    const driver = ctx.driver;
    const selectors = ctx.selectors;

    const location = ctx.config.formData?.locations || '';

    // #region agent log
    DEBUG_LOG('linkedin_impl.ts:setSearchLocation', 'Entry', { location, locationLength: location.length }, 'H1');
    // #endregion
    if (!location) {
      // #region agent log
      DEBUG_LOG('linkedin_impl.ts:setSearchLocation', 'Yield no_search_location_in_settings', { yielded: 'no_search_location_in_settings' }, 'H1');
      // #endregion
      yield "no_search_location_in_settings";
      return;
    }

    // Check if URL already contains location parameter - if so, skip filling form
    try {
      const currentUrl = await driver.getCurrentUrl();
      const urlObj = new URL(currentUrl);
      const urlLocation = urlObj.searchParams.get('location');
      if (urlLocation && urlLocation.toLowerCase().includes(location.toLowerCase())) {
        printLog(`Location already in URL: ${urlLocation}, skipping form fill`);
        ctx.search_location = location;
        if (ctx.overlay) {
          const progress = getLinkedInOverlayProgress(ctx);
          await ctx.overlay.showJobProgress(progress.done, progress.total, "Location already set via URL", 7).catch(() => { });
        }
        // #region agent log
        DEBUG_LOG('linkedin_impl.ts:setSearchLocation', 'Location already in URL, skipping', { urlLocation, yielded: 'search_location_set' }, 'H1');
        // #endregion
        yield "search_location_set";
        return;
      }
    } catch (error) {
      // URL parsing failed, continue to form filling
    }

    // Hide overlay so it does not block interaction; dismiss any LinkedIn overlays
    if (ctx.overlay) await ctx.overlay.hideOverlay().catch(() => { });
    await dismissLinkedInOverlays(driver);
    await driver.sleep(500);

    const locationSelectors = selectors.jobs?.location_input_candidates || [];
    const locationXpaths = [
      "//input[contains(@aria-label,'City') or contains(@aria-label,'Location') or contains(@placeholder,'City') or contains(@placeholder,'Location')]",
      "//input[@role='combobox' and (contains(@aria-label,'location') or contains(@placeholder,'location'))]"
    ];

    for (let idx = 0; idx < locationSelectors.length; idx++) {
      const selector = locationSelectors[idx];
      try {
        const locationInput = await driver.wait(until.elementLocated(By.css(selector)), 10000);
        await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", locationInput);
        await driver.sleep(300);
        await locationInput.click();
        await driver.sleep(500);
        await locationInput.sendKeys(Key.CONTROL, 'a');
        await locationInput.sendKeys(Key.DELETE);
        await locationInput.sendKeys(location);
        await driver.sleep(1000);
        await locationInput.sendKeys(Key.ENTER);

        printLog(`Location: ${location}`);
        ctx.search_location = location;
        if (ctx.overlay) {
          const progress = getLinkedInOverlayProgress(ctx);
          await ctx.overlay.showJobProgress(progress.done, progress.total, "Location set", 7).catch(() => { });
        }
        // #region agent log
        DEBUG_LOG('linkedin_impl.ts:setSearchLocation', 'Location set', { selectorIndex: idx, yielded: 'search_location_set' }, 'H2');
        // #endregion
        yield "search_location_set";
        return;
      } catch (error) {
        // #region agent log
        DEBUG_LOG('linkedin_impl.ts:setSearchLocation', 'Selector failed', { selectorIndex: idx, selector: selector.substring(0, 60), error: String((error as Error)?.message ?? error) }, 'H2');
        // #endregion
        continue;
      }
    }
    for (let idx = 0; idx < locationXpaths.length; idx++) {
      try {
        const locationInput = await driver.wait(until.elementLocated(By.xpath(locationXpaths[idx])), 5000);
        await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", locationInput);
        await driver.sleep(300);
        await locationInput.click();
        await driver.sleep(500);
        await locationInput.sendKeys(Key.CONTROL, 'a');
        await locationInput.sendKeys(Key.DELETE);
        await locationInput.sendKeys(location);
        await driver.sleep(1000);
        await locationInput.sendKeys(Key.ENTER);
        printLog(`Location (XPath): ${location}`);
        ctx.search_location = location;
        if (ctx.overlay) {
          const progress = getLinkedInOverlayProgress(ctx);
          await ctx.overlay.showJobProgress(progress.done, progress.total, "Location set", 7).catch(() => { });
        }
        // #region agent log
        DEBUG_LOG('linkedin_impl.ts:setSearchLocation', 'Location set via XPath', { xpathIndex: idx, yielded: 'search_location_set' }, 'H2');
        // #endregion
        yield "search_location_set";
        return;
      } catch (error) {
        continue;
      }
    }

    // Location input not found - yield outcome that transitions to set_search_keywords (so we always proceed without requiring YAML change / restart)
    if (ctx.overlay) {
      const progress = getLinkedInOverlayProgress(ctx);
      await ctx.overlay.showJobProgress(progress.done, progress.total, "Location not set", 7).catch(() => { });
    }
    // #region agent log
    DEBUG_LOG('linkedin_impl.ts:setSearchLocation', 'Yield no_search_location_in_settings (proceed to keywords)', { yielded: 'no_search_location_in_settings' }, 'H2');
    // #endregion
    yield "no_search_location_in_settings";
  } catch (error) {
    if (ctx.overlay) {
      const progress = getLinkedInOverlayProgress(ctx);
      await ctx.overlay.showJobProgress(progress.done, progress.total, "Error setting location", 7).catch(() => { });
    }
    yield "failed_setting_search_location";
  }
}

// Set search keywords
export async function* setSearchKeywords(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    const driver = ctx.driver;
    const selectors = ctx.selectors;

    const keywords = ctx.config.formData?.keywords || '';

    // #region agent log
    DEBUG_LOG('linkedin_impl.ts:setSearchKeywords', 'Entry', { keywords, keywordsLength: keywords.length }, 'H1');
    // #endregion
    if (!keywords) {
      yield "no_keywords_in_settings";
      return;
    }

    // Check if URL already contains keywords parameter - if so, skip filling form
    try {
      const currentUrl = await driver.getCurrentUrl();
      const urlObj = new URL(currentUrl);
      const urlKeywords = urlObj.searchParams.get('keywords');
      if (urlKeywords && urlKeywords.toLowerCase().includes(keywords.toLowerCase())) {
        printLog(`Keywords already in URL: ${urlKeywords}, skipping form fill`);
        ctx.search_keywords = keywords;
        if (ctx.overlay) {
          const progress = getLinkedInOverlayProgress(ctx);
          await ctx.overlay.showJobProgress(progress.done, progress.total, "Keywords already set via URL", 6).catch(() => { });
        }
        // #region agent log
        DEBUG_LOG('linkedin_impl.ts:setSearchKeywords', 'Keywords already in URL, skipping', { urlKeywords, yielded: 'search_keywords_set' }, 'H1');
        // #endregion
        yield "search_keywords_set";
        return;
      }
    } catch (error) {
      // URL parsing failed, continue to form filling
    }

    // Hide overlay so it does not block interaction; dismiss any LinkedIn overlays
    if (ctx.overlay) await ctx.overlay.hideOverlay().catch(() => { });
    await dismissLinkedInOverlays(driver);
    await driver.sleep(500);

    const keywordSelectors = selectors.jobs?.keywords_input_candidates || [];

    // Wait for search box to be present (results load asynchronously after opening jobs page)
    for (let idx = 0; idx < keywordSelectors.length; idx++) {
      const selector = keywordSelectors[idx];
      try {
        const keywordsInput = await driver.wait(until.elementLocated(By.css(selector)), 10000);
        await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", keywordsInput);
        await driver.sleep(300);
        await keywordsInput.click();
        await driver.sleep(500);
        await keywordsInput.sendKeys(Key.CONTROL, 'a');
        await keywordsInput.sendKeys(Key.DELETE);
        await keywordsInput.sendKeys(keywords);
        await driver.sleep(800);
        await keywordsInput.sendKeys(Key.ENTER);
        await driver.sleep(4000); // wait for search results to load

        printLog(`Keywords: ${keywords}`);
        ctx.search_keywords = keywords;
        if (ctx.overlay) {
          const progress = getLinkedInOverlayProgress(ctx);
          await ctx.overlay.showJobProgress(progress.done, progress.total, "Keywords set", 6).catch(() => { });
        }
        // #region agent log
        DEBUG_LOG('linkedin_impl.ts:setSearchKeywords', 'Keywords set', { selectorIndex: idx, yielded: 'search_keywords_set' }, 'H2');
        // #endregion
        yield "search_keywords_set";
        return;
      } catch (error) {
        // #region agent log
        DEBUG_LOG('linkedin_impl.ts:setSearchKeywords', 'Selector failed', { selectorIndex: idx, selector: selector.substring(0, 60), error: String((error as Error)?.message ?? error) }, 'H2');
        // #endregion
        continue;
      }
    }

    if (ctx.overlay) {
      const progress = getLinkedInOverlayProgress(ctx);
      await ctx.overlay.showJobProgress(progress.done, progress.total, "Keywords input not found", 6).catch(() => { });
    }
    // #region agent log
    DEBUG_LOG('linkedin_impl.ts:setSearchKeywords', 'Yield keywords_input_not_found', { yielded: 'keywords_input_not_found' }, 'H2');
    // #endregion
    yield "keywords_input_not_found";
  } catch (error) {
    if (ctx.overlay) {
      const progress = getLinkedInOverlayProgress(ctx);
      await ctx.overlay.showJobProgress(progress.done, progress.total, "Error setting keywords", 6).catch(() => { });
    }
    yield "failed_setting_search_keywords";
  }
}

// Apply filters
export async function* applyFilters(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {

  try {
    const driver = ctx.driver;
    const selectors = ctx.selectors?.jobs;

    await driver.sleep(2000);

    // Try to find and click "All filters" button (CSS from live DOM: search-reusables__all-filters-pill-button)
    try {
      // #region agent log
      DEBUG_LOG('linkedin_impl.ts:applyFilters', 'Before All filters', {}, 'H4');
      // #endregion
      let allFiltersButton;
      const allFiltersCss = selectors?.all_filters_button?.css;
      const allFiltersXpath = selectors?.all_filters_button?.xpath || "//button[normalize-space()='All filters']";
      try {
        if (allFiltersCss) allFiltersButton = await driver.findElement(By.css(allFiltersCss));
        else throw new Error('no css');
      } catch {
        allFiltersButton = await driver.findElement(By.xpath(allFiltersXpath));
      }
      await allFiltersButton.click();
      await driver.sleep(2000);

      // Apply location in the filters modal only if URL does not already have location (avoid re-editing)
      const location = (ctx.config.formData?.locations || '').trim();
      let urlAlreadyHasLocation = false;
      if (location) {
        try {
          const currentUrl = await driver.getCurrentUrl();
          const urlObj = new URL(currentUrl);
          const urlLocation = urlObj.searchParams.get('location');
          urlAlreadyHasLocation = !!(urlLocation && urlLocation.toLowerCase().includes(location.toLowerCase()));
        } catch {
          // ignore
        }
      }
      if (location && !urlAlreadyHasLocation) {
        const locationInputXpaths = [
          "//input[contains(@aria-label,'City') or contains(@aria-label,'Location') or contains(@placeholder,'City') or contains(@placeholder,'Location')]",
          "//input[@role='combobox' and (contains(@aria-label,'location') or contains(@placeholder,'location'))]",
          "//label[contains(.,'Location') or contains(.,'City')]/following::input[1]",
          "//*[contains(text(),'Location') or contains(text(),'City')]/following::input[1]"
        ];
        for (const xpath of locationInputXpaths) {
          try {
            const locationInput = await driver.findElement(By.xpath(xpath));
            await locationInput.click();
            await driver.sleep(300);
            await locationInput.sendKeys(Key.CONTROL, 'a');
            await locationInput.sendKeys(Key.DELETE);
            await locationInput.sendKeys(location);
            await driver.sleep(800);
            await locationInput.sendKeys(Key.ENTER);
            printLog(`Filters: location set to ${location}`);
            break;
          } catch {
            continue;
          }
        }
      }

      // Click Easy Apply filter if configured
      if (ctx.config.formData?.easyApplyOnly) {
        try {
          const easyApplyButton = await driver.findElement(By.xpath('//button[contains(text(), "Easy Apply")]'));
          await easyApplyButton.click();
          await driver.sleep(1000);
        } catch (error) {
          // Filter not available
        }
      }

      // Click "Show results" button
      try {
        const showResultsCss = selectors?.show_results_button?.css || 'button[aria-label*="Apply current filters"]';
        const showResultsButton = await driver.findElement(By.css(showResultsCss));
        await showResultsButton.click();
        await driver.sleep(3000);
      } catch (error) {
        // Continue without filters
      }

      // #region agent log
      DEBUG_LOG('linkedin_impl.ts:applyFilters', 'Filters applied', { yielded: 'filters_applied_successfully' }, 'H4');
      // #endregion
      yield "filters_applied_successfully";
    } catch (error) {
      // All filters not found or modal not present - still proceed so job list can load (preferred job already set by keywords/location)
      // #region agent log
      DEBUG_LOG('linkedin_impl.ts:applyFilters', 'All filters failed (proceeding)', { error: String((error as Error)?.message ?? error), yielded: 'filters_applied_successfully' }, 'H4');
      // #endregion
      yield "filters_applied_successfully";
    }
  } catch (error) {
    yield "filters_application_failed";
  }
}

// Get page info
export async function* getPageInfo(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {

  try {
    const driver = ctx.driver;

    // Try to detect pagination
    try {
      const paginationContainer = await driver.findElement(By.css('ul.artdeco-pagination__pages'));
      const activeButton = await paginationContainer.findElement(By.css('button[aria-current="page"]'));
      const pageText = await activeButton.getText();
      const currentPage = parseInt(pageText) || 1;

      ctx.has_pagination = true;
      ctx.pagination_current_page = currentPage;
    } catch (error) {
      ctx.has_pagination = false;
      ctx.pagination_current_page = 1;
    }

    yield "page_info_extracted";
  } catch (error) {
    yield "failed_extracting_page_info";
  }
}

// Extract job details
export async function* extractJobDetails(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    const driver = ctx.driver;
    const extractLimit = getLinkedInExtractLimit(ctx);
    const alreadyExtracted = Number((ctx as any).jobs_extracted || 0);
    if (alreadyExtracted === 0) {
      (ctx as any)._saved_platform_job_ids = new Set<string>();
    }
    if (extractLimit > 0) {
      printLog(`LinkedIn extract limit: ${extractLimit} (already processed: ${alreadyExtracted})`);
    }

    if (extractLimit > 0 && alreadyExtracted >= extractLimit) {
      printLog(`Reached extract limit (${extractLimit}), finishing extract flow`);
      yield "max_jobs_reached";
      return;
    }

    await driver.sleep(2000);

    // Wait for list to load and only prepare page cursor (no pre-iteration over every card).
    let jobCards: Awaited<ReturnType<WebDriver['findElements']>> = [];
    try {
      await driver.wait(until.elementsLocated(By.css('li[data-occludable-job-id], li[data-job-id]')), 15000);
      jobCards = await driver.findElements(By.css('li[data-occludable-job-id], li[data-job-id]'));
    } catch {
      jobCards = [];
    }
    if (jobCards.length === 0) {
      const jobLinks = await driver.findElements(By.css('a[href*="/jobs/view/"]'));
      if (jobLinks.length > 0) {
        for (const link of jobLinks) {
          try {
            const li = await link.findElement(By.xpath('./ancestor::li[1]'));
            jobCards.push(li);
          } catch {
            // skip
          }
        }
      }
    }

    // #region agent log
    DEBUG_LOG('linkedin_impl.ts:extractJobDetails', 'Job cards found', { jobCardsLength: jobCards.length, currentUrl: await driver.getCurrentUrl().catch(() => '') }, 'H3');
    // #endregion
    if (jobCards.length === 0) {
      // #region agent log
      DEBUG_LOG('linkedin_impl.ts:extractJobDetails', 'Yield no_job_cards_found', { yielded: 'no_job_cards_found' }, 'H3');
      // #endregion
      yield "no_job_cards_found";
      return;
    }

    printLog(`Found ${jobCards.length} jobs on current page`);
    const remaining = extractLimit > 0 ? Math.max(0, extractLimit - alreadyExtracted) : jobCards.length;
    const pageJobCount = Math.min(jobCards.length, remaining);
    const pageJobs: Array<{ job_id: string; title: string; company: string; location: string; url: string }> = [];
    for (let i = 0; i < pageJobCount; i++) {
      const card = jobCards[i];
      let jobId = '';
      let title = '';
      let company = '';
      let location = '';
      try {
        jobId = (await card.getAttribute('data-occludable-job-id')) || (await card.getAttribute('data-job-id')) || '';
      } catch {
        jobId = '';
      }
      try {
        const titleEl = await card.findElement(By.css('a.job-card-list__title--link, a[href*="/jobs/view/"]'));
        title = (await titleEl.getText()).trim();
        if (!jobId) {
          const href = await titleEl.getAttribute('href');
          jobId = parseLinkedInJobId(href || '') || jobId;
        }
      } catch {
        // ignore
      }
      try {
        const companyEl = await card.findElement(By.css('.artdeco-entity-lockup__subtitle span'));
        company = (await companyEl.getText()).trim();
      } catch {
        // ignore
      }
      try {
        const locationEl = await card.findElement(By.css('.job-card-container__metadata-wrapper li span'));
        const rawLocation = (await locationEl.getText()).trim();
        const { cleanedLocation, workplaceType } = cleanLocation(rawLocation);
        location = cleanedLocation;
        (card as any).workplaceType = workplaceType; // Temporary storage for refinement if needed
      } catch {
        // ignore
      }
      if (jobId) {
        pageJobs.push({
          job_id: String(jobId),
          title,
          company,
          location,
          url: `https://www.linkedin.com/jobs/view/${jobId}`
        });
      }
    }

    ctx.extracted_jobs = [];
    (ctx as any).page_jobs = pageJobs;
    (ctx as any).page_job_count = pageJobCount;
    ctx.total_jobs = extractLimit > 0 ? extractLimit : Math.max(Number(ctx.total_jobs || 0), alreadyExtracted + pageJobCount);
    ctx.applied_jobs = ctx.applied_jobs || 0;
    ctx.skipped_jobs = ctx.skipped_jobs || 0;
    (ctx as any).jobs_extracted = alreadyExtracted;
    (ctx as any).last_extract_success = false;
    ctx.current_job_index = 0;
    ctx.current_job = null;

    const toProcess = pageJobCount;
    if (toProcess === 0) {
      if (extractLimit > 0 && alreadyExtracted >= extractLimit) {
        yield "max_jobs_reached";
      } else {
        yield "no_job_cards_found";
      }
      return;
    }

    await ctx.overlay.updateJobProgress(
      alreadyExtracted,
      ctx.total_jobs || toProcess,
      `Prepared ${toProcess} jobs on page ${ctx.pagination_current_page || 1}`,
      10
    );
    await ctx.overlay.addLogEvent(
      `Prepared ${toProcess} jobs on page ${ctx.pagination_current_page || 1} (${alreadyExtracted}/${ctx.total_jobs || toProcess} done)`
    );

    // #region agent log
    DEBUG_LOG('linkedin_impl.ts:extractJobDetails', 'Page prepared for sequential extraction', { pageJobCount: toProcess, yielded: 'jobs_prepared' }, 'H3');
    // #endregion
    // Use bot_name from ctx (set by workflow engine via setContext) to determine pipeline.
    // linkedin_extract uses the extract-only pipeline (jobs_prepared → open_current_job_card).
    // linkedin / linkedin_apply uses the legacy path (proceed_to_process_jobs → process_jobs).
    const resolvedBotName = (ctx as any).bot_name || (ctx.config as any)?.botName || '';
    if (resolvedBotName === 'linkedin_extract') {
      yield "jobs_prepared";
    } else {
      // Backward-compatible path for legacy linkedin_steps.yaml
      yield "proceed_to_process_jobs";
    }
  } catch (error) {
    printLog(`Error extracting job details: ${error}`);
    // #region agent log
    DEBUG_LOG('linkedin_impl.ts:extractJobDetails', 'Extract error', { error: String((error as Error)?.message ?? error), yielded: 'failed_extracting_jobs' }, 'H3');
    // #endregion
    yield "failed_extracting_jobs";
  }
}

// Process jobs
export async function* processJobs(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const extractedJobs = ctx.extracted_jobs || [];

  if (extractedJobs.length === 0) {
    yield "no_jobs_to_process";
    return;
  }

  printLog(`Processing ${extractedJobs.length} jobs to backend...`);

  for (const job of extractedJobs) {
    const payload = {
      platform: 'linkedin',
      platformJobId: job.job_id || Date.now().toString(),
      title: job.title || 'Unknown Title',
      company: job.company || 'Unknown Company',
      url: job.link || `https://www.linkedin.com/jobs/view/${job.job_id}`,
      location: job.location,
      rawData: job
    };

    try {
      const response = await fetch('http://localhost:3000/api/scraped-jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ctx.auth_token || process.env.CORPUS_RAG_TOKEN || ''}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errT = await response.text();
        printLog(`⚠️ Failed to save job ${job.job_id} (HTTP ${response.status}): ${errT}`);
      } else {
        printLog(`✅ Saved scraped job: ${job.title} at ${job.company}`);
      }
    } catch (apiErr) {
      printLog(`⚠️ Network error saving job ${job.job_id}: ${apiErr}`);
    }
  }

  yield "jobs_saved";
}

// Open current card from prepared extracted_jobs list (extract-only pipeline).
export async function* openCurrentExtractJobCard(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    const driver = ctx.driver;
    const panelSelectors = ctx.selectors?.jobs?.job_details_panel;
    const preparedPageJobs = (((ctx as any).page_jobs || []) as Array<{ job_id: string; title: string; company: string; location: string; url: string }>);
    const totalJobs = Number(ctx.total_jobs || 0);
    const currentIndex = Number(ctx.current_job_index || 0);
    const pageJobCount = Number((ctx as any).page_job_count || 0);
    const extractLimit = getLinkedInExtractLimit(ctx);
    const alreadyExtracted = Number((ctx as any).jobs_extracted || 0);

    if (extractLimit > 0 && alreadyExtracted >= extractLimit) {
      yield "max_jobs_reached";
      return;
    }
    if (pageJobCount <= 0 || currentIndex >= pageJobCount) {
      yield "no_jobs_to_process";
      return;
    }

    let jobCards = await driver.findElements(By.css('li[data-occludable-job-id], li[data-job-id]'));
    if (jobCards.length === 0) {
      const links = await driver.findElements(By.css('a[href*="/jobs/view/"]'));
      const listItems: Awaited<ReturnType<WebDriver['findElements']>> = [];
      for (const link of links) {
        try {
          listItems.push(await link.findElement(By.xpath('./ancestor::li[1]')));
        } catch {
          // skip
        }
      }
      jobCards = listItems;
    }
    const targetPrepared = preparedPageJobs[currentIndex];
    if (!targetPrepared && (jobCards.length === 0 || currentIndex >= jobCards.length)) {
      yield "no_jobs_to_process";
      return;
    }

    let card = targetPrepared?.job_id
      ? await driver.findElement(By.css(`li[data-occludable-job-id="${targetPrepared.job_id}"], li[data-job-id="${targetPrepared.job_id}"]`)).catch(() => null as any)
      : null as any;
    if (!card) {
      card = jobCards[currentIndex];
    }
    if (!card) {
      (ctx as any).last_extract_success = false;
      yield "job_open_failed";
      return;
    }
    await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", card);
    await driver.sleep(200);

    let jobId = await card.getAttribute('data-occludable-job-id') || await card.getAttribute('data-job-id');
    if (!jobId) {
      try {
        const link = await card.findElement(By.css('a[href*="/jobs/view/"]'));
        const href = await link.getAttribute('href') || '';
        const match = href.match(/\/jobs\/view\/(\d+)/);
        if (match?.[1]) jobId = match[1];
      } catch {
        // ignore
      }
    }

    if (!jobId) {
      (ctx as any).last_extract_success = false;
      yield "job_open_failed";
      return;
    }
    let title = targetPrepared?.title || '';
    let company = targetPrepared?.company || '';
    let location = targetPrepared?.location || '';
    try {
      const titleEl = await card.findElement(By.css('a.job-card-list__title--link, a[href*="/jobs/view/"]'));
      title = (await titleEl.getText()).trim();
    } catch {
      // ignore
    }
    try {
      const companyEl = await card.findElement(By.css('.artdeco-entity-lockup__subtitle span'));
      company = (await companyEl.getText()).trim();
    } catch {
      // ignore
    }
    try {
      const locationEl = await card.findElement(By.css('.job-card-container__metadata-wrapper li span'));
      location = (await locationEl.getText()).trim();
    } catch {
      // ignore
    }
    const currentJob = {
      job_id: String(jobId),
      title,
      company,
      work_location: location,
      location,
      url: targetPrepared?.url || `https://www.linkedin.com/jobs/view/${jobId}`
    };
    ctx.current_job = currentJob;
    // Reset parsed artifacts to avoid stale file reuse between cards.
    ctx.currentJobFile = '';
    ctx.currentJobDir = '';
    ctx.current_job_details = null;

    const originalWindow = await driver.getWindowHandle().catch(() => '');
    const closeExtraTabs = async () => {
      try {
        const handles = await driver.getAllWindowHandles();
        if (handles.length > 1) {
          const original = originalWindow || handles[0];
          for (const handle of handles) {
            if (handle !== original) {
              await driver.switchTo().window(handle);
              await driver.close();
            }
          }
          await driver.switchTo().window(original);
        }
      } catch { /* keep flow running */ }
    };

    const waitForPanelReadiness = async (): Promise<boolean> => {
      const readyCandidates = [
        panelSelectors?.title_css || 'div.job-details-jobs-unified-top-card__job-title h1',
        panelSelectors?.description_text_css || 'div.jobs-box__html-content',
        'div.jobs-search__job-details--wrapper'
      ];
      for (const selector of readyCandidates) {
        if (!selector) continue;
        try {
          await withTimeout(driver.wait(until.elementLocated(By.css(selector)), 3000), 5000, `Wait job details selector: ${selector}`);
          return true;
        } catch { /* try next */ }
      }
      return false;
    };

    // Click strategies in escalating order of invasiveness.
    const clickStrategies: Array<{ name: string; execute: () => Promise<void> }> = [
      {
        name: 'link-click',
        async execute() {
          await withTimeout(driver.executeScript(`
            var card = arguments[0];
            var link = card?.querySelector?.('a[href*="/jobs/view/"]');
            if (link) {
              link.setAttribute('target', '_self');
              link.removeAttribute('rel');
              link.click();
            } else {
              card?.click?.();
            }
          `, card), 6000, 'Click job card link');
        }
      },
      {
        name: 'selenium-click',
        async execute() {
          try {
            const link = await card.findElement(By.css('a[href*="/jobs/view/"]'));
            await link.click();
          } catch {
            await card.click();
          }
        }
      },
      {
        name: 'direct-nav',
        async execute() {
          const directUrl = `https://www.linkedin.com/jobs/view/${jobId}`;
          try {
            await withTimeout(driver.get(directUrl), 15000, 'Direct nav to job URL');
          } catch (err) {
            printLog('Timeout during direct job nav (page load strategy eager might be active).');
          }
          await driver.sleep(1000);
        }
      }
    ];

    let synced = false;
    let syncResult: Awaited<ReturnType<typeof waitForLinkedInPanelSync>> | null = null;
    const maxAttempts = clickStrategies.length;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const strategy = clickStrategies[attempt];
      let clickOk = false;
      try {
        if (attempt > 0) {
          await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", card).catch(() => { });
          await driver.sleep(300);
        }
        await strategy.execute();
        clickOk = true;
      } catch {
        printLog(`⚠️ Click strategy "${strategy.name}" failed for ${jobId} (attempt ${attempt + 1}/${maxAttempts})`);
      }

      await closeExtraTabs();

      if (!clickOk) {
        const currentUrl = await driver.getCurrentUrl().catch(() => '');
        clickOk = currentUrl.includes(`/jobs/view/${jobId}`);
      }
      if (!clickOk && attempt < maxAttempts - 1) continue;
      if (!clickOk) break;

      // Wait for aria-current on the target card (LinkedIn's own selection signal).
      try {
        await withTimeout(driver.wait(async () => {
          const ariaCur = await driver.executeScript(`
            var el = document.querySelector('li[data-occludable-job-id="${jobId}"], li[data-job-id="${jobId}"]');
            return el ? el.getAttribute('aria-current') : null;
          `).catch(() => null) as string | null;
          return ariaCur === 'true';
        }, 3000), 4000, 'Wait aria-current');
      } catch { /* not fatal — continue to panel check */ }

      const panelReady = await waitForPanelReadiness();
      if (!panelReady) {
        printLog(`⚠️ Panel not readable after "${strategy.name}" for ${jobId} (attempt ${attempt + 1}/${maxAttempts})`);
        if (attempt < maxAttempts - 1) continue;
        break;
      }

      const syncTimeoutMs = attempt === 0 ? 9000 : 6000;
      syncResult = await waitForLinkedInPanelSync(driver, panelSelectors, currentJob, syncTimeoutMs);
      if (syncResult.synced) {
        synced = true;
        break;
      }
      printLog(`⚠️ Sync check failed after "${strategy.name}" for ${jobId} (attempt ${attempt + 1}/${maxAttempts}). Panel state: urlJobId=${syncResult.lastSnapshot.urlJobId}, panelJobId=${syncResult.lastSnapshot.panelJobId}, panelTitle="${syncResult.lastSnapshot.panelTitle}"`);
    }

    if (!synced) {
      const snap = syncResult?.lastSnapshot;
      printLog(`⚠️ Panel did not sync to clicked job ${jobId} after ${maxAttempts} attempts; skipping to avoid duplicate save`);
      await ctx.overlay.addLogEvent(`Skipping unsynced panel for ${jobId} (got panelId=${snap?.panelJobId || '?'}, title="${snap?.panelTitle || '?'}")`);
      (ctx as any).last_extract_success = false;
      yield "job_open_failed";
      return;
    }

    await driver.sleep(500);
    const progressMsg = `${alreadyExtracted + 1}/${totalJobs || pageJobCount} ${currentJob?.title || 'LinkedIn job'}`;
    printLog(`🔍 Processing LinkedIn job ${progressMsg}`);
    await ctx.overlay.updateJobProgress(
      alreadyExtracted,
      totalJobs || pageJobCount,
      `Opening job ${alreadyExtracted + 1}/${totalJobs || pageJobCount}`,
      11
    );
    await ctx.overlay.addLogEvent(
      `Opening: ${currentJob?.title || 'Unknown title'} @ ${currentJob?.company || 'Unknown company'}`
    );
    yield "job_card_opened";
  } catch (error) {
    printLog(`openCurrentExtractJobCard error: ${error}`);
    (ctx as any).last_extract_success = false;
    yield "job_open_failed";
  }
}

// Save a parsed LinkedIn job one-by-one, using Seek-style robust save path.
export async function* saveLinkedInScrapedJob(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    if (!ctx.currentJobFile || !fs.existsSync(ctx.currentJobFile)) {
      throw new Error("No parsed LinkedIn job details file found.");
    }

    const jobData = JSON.parse(fs.readFileSync(ctx.currentJobFile, 'utf8'));
    const platformJobId = String(
      jobData.job_id ||
      parseLinkedInJobId(jobData.url) ||
      ctx.current_job?.job_id ||
      Date.now()
    );
    if (ctx.current_job?.job_id && String(ctx.current_job.job_id) !== platformJobId) {
      printLog(`⚠️ Save guard: current card job_id (${ctx.current_job.job_id}) != parsed file job_id (${platformJobId}), skipping save`);
      await ctx.overlay.addLogEvent(`Skipped mismatched save context: card ${ctx.current_job.job_id} vs file ${platformJobId}`);
      (ctx as any).last_extract_success = false;
      yield "save_failed";
      return;
    }
    const savedIds: Set<string> = ((ctx as any)._saved_platform_job_ids ||= new Set<string>());
    if (savedIds.has(platformJobId)) {
      printLog(`⚠️ Duplicate save suppressed for LinkedIn job ${platformJobId}`);
      await ctx.overlay.addLogEvent(`Duplicate suppressed: ${platformJobId}`);
      (ctx as any).last_extract_success = false;
      yield "save_failed";
      return;
    }
    const payload = {
      platform: 'linkedin',
      platformJobId,
      title: jobData.title || ctx.current_job?.title || 'Unknown Job Title',
      company: jobData.company || ctx.current_job?.company || 'Unknown Company',
      url: jobData.url || `https://www.linkedin.com/jobs/view/${platformJobId}`,
      location: jobData.location || ctx.current_job?.work_location || undefined,
      description: jobData.description || jobData.details || undefined,
      postedDate: jobData.time_posted || jobData.postedDate || undefined,
      workMode: Array.isArray(jobData.job_type_tags)
        ? (jobData.job_type_tags.find((tag: string) => /remote|hybrid|on[- ]?site|onsite/i.test(String(tag))) || undefined)
        : undefined,
      jobType: Array.isArray(jobData.job_type_tags)
        ? (jobData.job_type_tags.find((tag: string) => /full[- ]?time|part[- ]?time|contract|intern|temporary|casual/i.test(String(tag))) || undefined)
        : undefined,
      salary: jobData.salary || undefined,
      clientEmail: jobData.clientEmail || getClientEmailFromContext(ctx) || undefined,
      rawData: jobData
    };

    let saved = false;
    try {
      const { apiRequest } = await import('../core/api_client.js');
      const result = await apiRequest('/api/scraped-jobs', 'POST', payload);
      if (result?.success) {
        printLog(`✅ Saved LinkedIn job to DB: ${payload.title} (${platformJobId})`);
        saved = true;
      } else {
        printLog(`⚠️ LinkedIn save returned unexpected response: ${JSON.stringify(result)}`);
      }
    } catch (apiErr) {
      printLog(`⚠️ LinkedIn save via apiRequest failed: ${apiErr}`);
    }

    if (!saved) {
      try {
        const baseUrl = process.env.API_BASE || process.env.PUBLIC_API_BASE || 'http://localhost:3000';
        const tokenFromEnv = process.env.CORPUS_RAG_TOKEN || process.env.CORPUS_RAG_API_TOKEN || '';
        const tokenPath = path.join(process.cwd(), '.cache', 'api_token.txt');
        const tokenFromCache = fs.existsSync(tokenPath) ? fs.readFileSync(tokenPath, 'utf8').trim() : '';
        const token = tokenFromEnv || tokenFromCache;

        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${baseUrl}/api/scraped-jobs`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          printLog(`✅ Saved LinkedIn job via fallback: ${payload.title} (${platformJobId})`);
          saved = true;
        } else {
          const errText = await response.text().catch(() => '');
          printLog(`⚠️ LinkedIn fallback save failed (${response.status}): ${errText}`);
        }
      } catch (fallbackErr) {
        printLog(`⚠️ LinkedIn fallback save error: ${fallbackErr}`);
      }
    }

    const extractedCount = Number((ctx as any).jobs_extracted || 0);
    const totalJobs = Number(ctx.total_jobs || (ctx.extracted_jobs || []).length || extractedCount);
    const statusText = saved ? 'saved' : 'save failed';
    await ctx.overlay.updateJobProgress(
      extractedCount,
      totalJobs,
      `${saved ? 'Saved' : 'Failed to save'} job ${Math.min(extractedCount + 1, totalJobs)}/${totalJobs}`,
      13
    );
    await ctx.overlay.addLogEvent(
      `${saved ? 'Saved' : 'Failed'} ${Math.min(extractedCount + 1, totalJobs)}/${totalJobs}: ${payload.title} @ ${payload.company}`
    );
    if (saved) {
      savedIds.add(platformJobId);
    }
    (ctx as any).last_extract_success = saved;

    yield saved ? "job_saved" : "save_failed";
  } catch (error) {
    printLog(`saveLinkedInScrapedJob error: ${error}`);
    (ctx as any).last_extract_success = false;
    yield "save_failed";
  }
}

// Move to next card or next page for extract-only flow.
export async function* advanceExtractCursor(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const pageJobCount = Number((ctx as any).page_job_count || 0);
  const currentIndex = Number(ctx.current_job_index || 0);
  const nextIndex = currentIndex + 1;
  const extractLimit = getLinkedInExtractLimit(ctx);
  const didSaveCurrentJob = Boolean((ctx as any).last_extract_success);
  const extractedCount = Number((ctx as any).jobs_extracted || 0) + (didSaveCurrentJob ? 1 : 0);
  (ctx as any).jobs_extracted = extractedCount;
  const totalJobs = Number(ctx.total_jobs || pageJobCount || extractedCount);
  (ctx as any).last_extract_success = false;

  if (extractLimit > 0 && extractedCount >= extractLimit) {
    void ctx.overlay.addLogEvent(`Reached extract limit (${extractLimit})`);
    yield "max_jobs_reached";
    return;
  }
  if (nextIndex < pageJobCount) {
    ctx.current_job_index = nextIndex;
    ctx.current_job = null;
    void ctx.overlay.updateJobProgress(
      extractedCount,
      totalJobs,
      didSaveCurrentJob
        ? `Moving to next job ${nextIndex + 1}/${pageJobCount}`
        : `Skipping failed job, moving to ${nextIndex + 1}/${pageJobCount}`,
      14
    );
    yield "process_next_job";
    return;
  }
  void ctx.overlay.addLogEvent(`Completed page ${ctx.pagination_current_page || 1} (${extractedCount}/${totalJobs})`);
  yield "page_complete";
}

// Attempt Easy Apply
export async function* attemptEasyApply(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    const driver = ctx.driver;
    let currentJob = ctx.current_job;

    if (!currentJob) {
      const currentUrl = await driver.getCurrentUrl().catch(() => '');
      const inferredJobId = parseLinkedInJobId(currentUrl) || parseLinkedInJobId(ctx.config?.directApplyUrl);
      if (!inferredJobId) {
        yield "no_job_to_process";
        return;
      }
      currentJob = {
        job_id: inferredJobId,
        title: await driver.getTitle().catch(() => 'LinkedIn Job'),
        company: '',
        work_location: ''
      };
      ctx.current_job = currentJob;
    }

    const jobId = currentJob.job_id;
    const jobTitle = currentJob.title;
    const company = currentJob.company;

    printLog(`Processing: ${jobTitle}`);

    // Click on the job card to load details. In direct URL mode the card might not exist.
    let onJobDetailsPage = false;
    try {
      const jobCard = await driver.findElement(By.css(`[data-occludable-job-id="${jobId}"]`));
      await jobCard.click();
      await driver.sleep(2000);
      onJobDetailsPage = true;
    } catch {
      const currentUrl = await driver.getCurrentUrl().catch(() => '');
      if (currentUrl.includes('/jobs/view/')) {
        onJobDetailsPage = true;
      }
    }

    if (!onJobDetailsPage) {
      yield "job_card_not_found";
      return;
    }

    // Look for Easy Apply button - check button text to differentiate from regular Apply
    // Introduce XPath support to reliably target the inner span text
    const easyApplySelectors = ctx.selectors?.easy_apply?.button_css_candidates || [
      'button#jobs-apply-button-id',
      'button.jobs-apply-button',
      "//button[.//span[contains(text(), 'Easy Apply')]]",
      "//button[contains(., 'Easy Apply')]"
    ];

    let easyApplyButton = null;

    for (const selector of easyApplySelectors) {
      try {
        const byLocator = selector.startsWith('//') || selector.startsWith('(') ? By.xpath(selector) : By.css(selector);
        
        // Use findElements because findElement throws if not found
        const buttons = await driver.findElements(byLocator);
        for (const button of buttons) {
          const isDisplayed = await button.isDisplayed().catch(() => false);
          if (!isDisplayed) continue;
          
          const buttonText = await button.getText();
          // Only accept if it's "Easy Apply", not just "Apply"
          if (buttonText.includes('Easy Apply')) {
            easyApplyButton = button;
            break;
          }
        }
        
        if (easyApplyButton) break;
      } catch (error) {
        continue;
      }
    }

    if (easyApplyButton) {
      try {
        await easyApplyButton.click();
        await driver.sleep(2000);

        // Check if the Easy Apply modal opened
        try {
          const modal = await driver.findElement(By.css('div.jobs-easy-apply-modal'));

          // Check for initial profile setup form inside modal
          try {
            const modalHtml = await modal.getAttribute('innerHTML');
            if (modalHtml.includes('Be sure to include an updated resume') ||
              modalHtml.includes('Upload resume') ||
              modalHtml.includes('DOC, DOCX, PDF')) {

              printLog('⚠️ PROFILE SETUP REQUIRED');
              await ctx.overlay.showMessage(
                '⚠️ PROFILE SETUP REQUIRED ⚠️',
                'LinkedIn needs you to:\n\n1. Fill in contact info\n2. Upload resume\n3. Click Next\n4. Then click Continue here',
                'error'
              );

              yield "modal_failed_to_open";
              return;
            }
          } catch (innerError) {
            // No profile setup form found, continue
          }

          await ctx.overlay.updateJobProgress(
            ctx.applied_jobs || 0,
            ctx.total_jobs || 0,
            `Applying: ${jobTitle}`,
            14
          );

          yield "modal_opened_successfully";
        } catch (error) {
          yield "modal_failed_to_open";
        }
      } catch (error) {
        yield "failed_to_click_easy_apply";
      }
    } else {
      yield "no_easy_apply_button_found";
    }
  } catch (error) {
    yield "easy_apply_process_error";
  }
}

// Extract job details from the job details panel and save to JSON
export async function* extractJobDetailsFromPanel(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    const driver = ctx.driver;
    const currentJob = ctx.current_job;

    if (!currentJob || !currentJob.job_id) {
      (ctx as any).last_extract_success = false;
      yield "job_details_extraction_failed";
      return;
    }

    const jobId = currentJob.job_id;
    const selectors = ctx.selectors?.jobs?.job_details_panel;

    // Fast-fail when the details view is not actually loaded for this card.
    let detailsReady = false;
    const readinessSelectors = [
      selectors?.title_css || 'div.job-details-jobs-unified-top-card__job-title h1',
      selectors?.description_text_css || 'div.jobs-box__html-content',
      'div.jobs-search__job-details--wrapper'
    ];
    for (const selector of readinessSelectors) {
      if (!selector) continue;
      try {
        await withTimeout(driver.wait(until.elementLocated(By.css(selector)), 3000), 5000, `Extract wait selector: ${selector}`);
        detailsReady = true;
        break;
      } catch {
        // try next selector
      }
    }
    if (!detailsReady) {
      printLog(`⚠️ Job details not ready for job ${jobId}, skipping`);
      await ctx.overlay.addLogEvent(`Skipping job ${jobId}: details panel not available`);
      (ctx as any).last_extract_success = false;
      yield "job_details_extraction_failed";
      return;
    }

    // Lightweight sync sanity-check (openCurrentExtractJobCard already retried thoroughly).
    // Only spend 3s here to catch edge cases where the panel drifted between steps.
    const { synced: panelStillSynced } = await waitForLinkedInPanelSync(driver, selectors, currentJob, 3000);
    if (!panelStillSynced) {
      printLog(`⚠️ Details panel drifted for ${jobId} between open and extract, skipping`);
      await ctx.overlay.addLogEvent(`Skipping job ${jobId}: panel drifted after open`);
      (ctx as any).last_extract_success = false;
      yield "job_details_extraction_failed";
      return;
    }

    const jobDetails: any = {
      job_id: jobId,
      jobId,
      url: currentJob.url || `https://www.linkedin.com/jobs/view/${jobId}`,
      extracted_at: new Date().toISOString(),
    };

    // Extract title
    try {
      const titleElement = await driver.findElement(By.css(selectors?.title_css || 'div.job-details-jobs-unified-top-card__job-title h1'));
      jobDetails.title = (await titleElement.getText()).trim();
    } catch (error) {
      jobDetails.title = currentJob.title || '';
    }

    // Extract company
    try {
      const companyElement = await driver.findElement(By.css(selectors?.company_name_css || 'div.job-details-jobs-unified-top-card__company-name a'));
      jobDetails.company = (await companyElement.getText()).trim();
    } catch (error) {
      jobDetails.company = currentJob.company || '';
    }

    // If extracted panel doesn't resemble clicked card metadata, skip save path.
    if (currentJob.title && jobDetails.title && !isLikelySameText(jobDetails.title, currentJob.title)) {
      printLog(`⚠️ Title mismatch for ${jobId}. Expected card="${currentJob.title}" panel="${jobDetails.title}"`);
      await ctx.overlay.addLogEvent(`Skipping ${jobId}: title mismatch between list and panel`);
      (ctx as any).last_extract_success = false;
      yield "job_details_extraction_failed";
      return;
    }

    // Extract location
    try {
      const locationElement = await driver.findElement(By.xpath(selectors?.location_xpath || "//div[contains(@class, 'job-details-jobs-unified-top-card__tertiary-description')]//span[contains(@class, 'tvm__text--low-emphasis')][1]"));
      const rawLocation = (await locationElement.getText()).trim();
      const { cleanedLocation, workplaceType } = cleanLocation(rawLocation);
      jobDetails.location = cleanedLocation;
      if (workplaceType) {
        jobDetails.workMode = workplaceType;
      }
    } catch (error) {
      const { cleanedLocation, workplaceType } = cleanLocation(currentJob.work_location || '');
      jobDetails.location = cleanedLocation;
      if (workplaceType) jobDetails.workMode = workplaceType;
    }

    // Extract time posted
    try {
      const timeElement = await driver.findElement(By.xpath(selectors?.time_posted_xpath || "//div[contains(@class, 'job-details-jobs-unified-top-card__tertiary-description')]//span[contains(@class, 'tvm__text--positive')]//span"));
      jobDetails.time_posted = (await timeElement.getText()).trim();
    } catch (error) {
      jobDetails.time_posted = '';
    }

    // Extract applicants count
    try {
      const applicantsElement = await driver.findElement(By.xpath(selectors?.applicants_count_xpath || "//div[contains(@class, 'job-details-jobs-unified-top-card__tertiary-description')]//span[contains(text(), 'applicants')]"));
      jobDetails.applicants_count = (await applicantsElement.getText()).trim();
    } catch (error) {
      jobDetails.applicants_count = '';
    }

    // Extract job type tags (Remote, Full-time, etc.)
    try {
      const tagElements = await driver.findElements(By.css(selectors?.job_type_tags_css || 'div.job-details-fit-level-preferences button'));
      const tags = [];
      for (const tag of tagElements) {
        const tagText = (await tag.getText()).trim();
        if (tagText) tags.push(tagText);
        
        // Secondary check for workplace type in tags
        if (!jobDetails.workMode) {
          const { workplaceType } = cleanLocation(tagText);
          if (workplaceType) jobDetails.workMode = workplaceType;
        }
      }
      jobDetails.job_type_tags = tags;
    } catch (error) {
      jobDetails.job_type_tags = [];
    }

    // Extract description
    try {
      const descElement = await driver.findElement(By.css(selectors?.description_text_css || 'div.jobs-box__html-content'));
      jobDetails.description = (await descElement.getText()).trim();
    } catch (error) {
      jobDetails.description = '';
    }

    // Save to file
    const jobsDir = getJobArtifactDir(ctx, 'linkedin', jobId);

    if (!fs.existsSync(jobsDir)) {
      fs.mkdirSync(jobsDir, { recursive: true });
    }

    const jobDetailsPath = path.join(jobsDir, 'job_details.json');
    const clientEmail = getClientEmailFromContext(ctx);
    if (clientEmail) {
      jobDetails.clientEmail = clientEmail;
    }
    fs.writeFileSync(jobDetailsPath, JSON.stringify(jobDetails, null, 2));

    printLog(`Saved: ${jobDetails.title} at ${jobDetails.company}`);
    ctx.current_job_details = jobDetails;
    ctx.currentJobFile = jobDetailsPath;
    ctx.currentJobDir = jobsDir;

    yield "job_details_extracted";
  } catch (error) {
    (ctx as any).last_extract_success = false;
    yield "job_details_extraction_failed";
  }
}

async function resolveResumeTextForLinkedIn(ctx: WorkflowContext): Promise<string> {
  const clientEmail =
    getClientEmailFromContext(ctx) ||
    (ctx as any)?.config?.formData?.email ||
    '';

  if (!clientEmail) {
    throw new Error('Missing client email. Canonical resume lookup requires user email in config.');
  }

  const preferredResumeFileName = String(((ctx as any)?.config?.formData?.resumeFileName || '')).trim();
  const resume = readCanonicalResumeText(clientEmail, preferredResumeFileName);
  printLog(`📄 Using canonical resume: ${resume.filename}`);
  return resume.content;
}

// Generate AI cover letter for LinkedIn (same API as Seek, platform: linkedin)
async function generateAICoverLetterLinkedIn(ctx: WorkflowContext): Promise<string> {
  let jobData: any = {};
  if (ctx.currentJobFile && fs.existsSync(ctx.currentJobFile)) {
    jobData = JSON.parse(fs.readFileSync(ctx.currentJobFile, 'utf-8'));
  }
  const jobId = jobData.job_id || jobData.jobId || 'unknown';
  const title = jobData.title || '';
  const company = jobData.company || '';
  const description = jobData.description || `${title} at ${company}`;

  if (!title || !company) {
    throw new Error("No job data available - cannot generate cover letter");
  }

  printLog("Generating AI cover letter for LinkedIn...");
  printLog(`📝 Job: ${title} at ${company}`);

  const resumeText = await resolveResumeTextForLinkedIn(ctx);
  const formData = ((ctx as any)?.config?.formData || {}) as Record<string, string>;
  const contactProfile = {
    full_name: String(formData.fullName || '').trim(),
    email: String(formData.email || getClientEmailFromContext(ctx) || '').trim(),
    phone: String(formData.phone || '').trim(),
    linkedin_url: String(formData.linkedinUrl || '').trim()
  };

  const jobDirPath = getJobArtifactDir(ctx, 'linkedin', jobId);

  const requestBody = {
    job_id: `linkedin_${jobId}`,
    job_details: description,
    resume_text: resumeText,
    useAi: "deepseek-chat",
    strictQuality: true,
    qualityThreshold: 92,
    strictQualityRetries: 1,
    contact_profile: contactProfile,
    platform: "linkedin",
    platform_job_id: jobId,
    job_title: title,
    company,
    prompt: `Write a compelling, professional cover letter for this LinkedIn job posting.
Highlight relevant experience and skills that match the job requirements.
Keep it concise (300-400 words) and personalized to ${company}.
Focus on demonstrating value and enthusiasm for the role.`
  };

  fs.writeFileSync(
    path.join(jobDirPath, 'cover_letter_request.json'),
    JSON.stringify(requestBody, null, 2)
  );

  const { apiRequest } = await import('../core/api_client.js');
  try {
    const promptRes = await apiRequest('/api/prompts/cover-letter', 'GET');
    if (promptRes?.content) {
      requestBody.prompt = promptRes.content;
    }
  } catch (e) {
    printLog(`⚠️ Could not fetch cover-letter prompt, using embedded fallback`);
  }

  let data: any;
  try {
    data = await apiRequest('/api/cover_letter', 'POST', requestBody);
  } catch (apiError: unknown) {
    const msg = apiError instanceof Error ? apiError.message : String(apiError);
    printLog(`❌ Cover letter API request failed: ${msg}`);
    throw new Error(`Cover letter API call failed: ${msg}`);
  }

  fs.writeFileSync(
    path.join(jobDirPath, 'cover_letter_response.json'),
    JSON.stringify(data, null, 2)
  );

  if (data && data.success === false) {
    throw new Error(`API returned error: ${(data as any).error || 'Unknown error'}`);
  }
  if (data && (data as any).cover_letter) {
    printLog(`✅ AI cover letter generated (${(data as any).cover_letter.length} chars)`);
    return (data as any).cover_letter;
  }
  throw new Error('No cover_letter field returned from API');
}

// Handle cover letter (Easy Apply modal – detect textarea, API, fill via selectors)
export async function* handleCoverLetter(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    const driver = ctx.driver;
    const easyApply = ctx.selectors?.easy_apply;
    const modalCss = easyApply?.modal_container_css || "div.jobs-easy-apply-modal";
    const coverLetterCss = easyApply?.cover_letter_textarea_css;
    const coverLetterXpath = easyApply?.cover_letter_textarea_xpath || "//textarea[contains(@placeholder, 'cover letter') or contains(@aria-label, 'cover letter')]";

    let textarea: Awaited<ReturnType<WebDriver['findElement']>> | null = null;
    try {
      const modal = await driver.findElement(By.css(modalCss));
      if (coverLetterCss) {
        try {
          textarea = await modal.findElement(By.css(coverLetterCss));
        } catch {
          // try first matching part if comma-separated
          const firstCss = coverLetterCss.split(',')[0].trim();
          if (firstCss) textarea = await modal.findElement(By.css(firstCss));
        }
      }
      if (!textarea && coverLetterXpath) {
        try {
          textarea = await modal.findElement(By.xpath(coverLetterXpath));
        } catch {
          // ignore
        }
      }
    } catch {
      try {
        if (coverLetterCss) textarea = await driver.findElement(By.css(coverLetterCss.split(',')[0].trim()));
        else if (coverLetterXpath) textarea = await driver.findElement(By.xpath(coverLetterXpath));
      } catch {
        // ignore
      }
    }

    if (!textarea) {
      printLog("Cover letter textarea not found - skipping");
      yield "cover_letter_not_required";
      return;
    }

    await textarea.click();
    await driver.sleep(300);
    await textarea.clear();
    const coverLetterText = await generateAICoverLetterLinkedIn(ctx);
    if (!coverLetterText || coverLetterText.trim().length < 50) {
      yield "cover_letter_error";
      return;
    }
    await textarea.sendKeys(coverLetterText);
    await driver.sleep(1000);
    printLog("Cover letter filled");
    yield "cover_letter_filled";
  } catch (error) {
    printLog(`Cover letter error: ${error}`);
    yield "cover_letter_error";
  }
}

// Generate AI resume for LinkedIn (same API as Seek, platform: linkedin); returns path to resume file.
async function generateAIResumeLinkedIn(ctx: WorkflowContext): Promise<string> {
  let jobData: any = {};
  if (ctx.currentJobFile && fs.existsSync(ctx.currentJobFile)) {
    jobData = JSON.parse(fs.readFileSync(ctx.currentJobFile, 'utf-8'));
  }
  const jobId = jobData.job_id || jobData.jobId || 'unknown';
  const title = jobData.title || '';
  const company = jobData.company || '';
  const description = jobData.description || `${title} at ${company}`;

  if (!title || !company) {
    throw new Error("No job data available - cannot generate resume");
  }

  printLog("Generating AI resume for LinkedIn...");
  const resumeText = await resolveResumeTextForLinkedIn(ctx);

  const jobDirPath = getJobArtifactDir(ctx, 'linkedin', jobId);

  const requestBody = {
    job_id: `linkedin_${jobId}`,
    job_details: description,
    resume_text: resumeText,
    useAi: "deepseek-chat",
    platform: "linkedin",
    platform_job_id: jobId,
    job_title: title,
    company,
    prompt: `Tailor this resume for the LinkedIn job posting. Optimize for ATS. Highlight experience and skills that match the job requirements. Keep formatting clean and professional.`
  };

  fs.writeFileSync(path.join(jobDirPath, 'resume_request.json'), JSON.stringify(requestBody, null, 2));
  const { apiRequest } = await import('../core/api_client.js');
  try {
    const promptRes = await apiRequest('/api/prompts/resume-tailor', 'GET');
    if (promptRes?.content) {
      requestBody.prompt = promptRes.content;
    }
  } catch (e) {
    printLog('⚠️ Could not fetch resume-tailor prompt, using embedded fallback');
  }
  const data: any = await apiRequest('/api/resume', 'POST', requestBody);
  fs.writeFileSync(path.join(jobDirPath, 'resume_response.json'), JSON.stringify(data, null, 2));

  if (!data || !data.resume) {
    throw new Error('No resume field returned from API');
  }
  const docxPath = path.join(jobDirPath, 'resume.docx');
  const paragraphs = String(data.resume || '').split('\n').map((line) =>
    new Paragraph({ children: [new TextRun(line)] })
  );
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs
      }
    ]
  });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(docxPath, buffer);
  return docxPath;
}

export async function* step0(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const config = ctx.config || {};
  printLog("Starting step 0...");

  if (config.directApplyUrl) {
    printLog(`Direct Apply URL detected: ${config.directApplyUrl}. Bypassing login check and search.`);
    yield "direct_apply_requested";
    return;
  }

  yield "step0_complete";
}

export async function* navigateToDirectApplyUrl(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    const directApplyUrl = String(ctx.config?.directApplyUrl || '').trim();
    if (!directApplyUrl) {
      printLog("No directApplyUrl provided for LinkedIn apply flow");
      yield "navigation_failed";
      return;
    }

    if (!ctx.driver) {
      const { driver, sessionExists, sessionsDir } = await setupChromeDriver('linkedin');
      ctx.driver = driver;
      ctx.sessionExists = sessionExists;
      ctx.sessionsDir = sessionsDir;
      ctx.humanBehavior = new HumanBehavior(DEFAULT_HUMANIZATION);
      ctx.sessionManager = new UniversalSessionManager(driver, SessionConfigs.linkedin);
      ctx.overlay = new UniversalOverlay(driver, 'LinkedIn');

      // Show overlay immediately — before any navigation
      await ctx.overlay.initialize();
      await ctx.overlay.showJobProgress(0, 0, 'Starting LinkedIn bot...', 0);

      await StealthFeatures.hideWebDriver(driver);
      await StealthFeatures.randomizeUserAgent(driver);
    }

    await ctx.driver.get(directApplyUrl);
    await ctx.driver.sleep(3000);

    const currentUrl = await ctx.driver.getCurrentUrl();
    const jobId = parseLinkedInJobId(currentUrl) || parseLinkedInJobId(directApplyUrl) || `unknown_${Date.now()}`;
    const pageTitle = await ctx.driver.getTitle().catch(() => 'LinkedIn Job');

    ctx.current_job_index = 0;
    ctx.current_job = {
      job_id: jobId,
      title: pageTitle || 'LinkedIn Job',
      company: '',
      work_location: ''
    };

    printLog(`Direct Apply URL opened: ${currentUrl}`);
    printLog(`Prepared apply context with jobId: ${jobId}`);
    yield "navigated";
  } catch (error) {
    printLog(`Direct Apply navigation failed: ${error}`);
    yield "navigation_failed";
  }
}

// Upload resume (Easy Apply modal – use selectors; optional AI resume, else config path; no file input → resume_not_required)
export async function* uploadResume(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  printLog("Uploading resume...");

  try {
    const driver = ctx.driver;
    const selectors = ctx.selectors?.easy_apply;
    const useAiResume = !!ctx.config?.formData?.useAiResume;
    let resumePath = (ctx.config?.formData?.resumePath || '').trim();

    if (useAiResume && ctx.currentJobFile) {
      try {
        resumePath = await generateAIResumeLinkedIn(ctx);
      } catch (err) {
        printLog(`AI resume generation failed: ${err} `);
        resumePath = (ctx.config?.formData?.resumePath || '').trim();
      }
    }

    if (!resumePath || !fs.existsSync(resumePath)) {
      printLog("No resume path or file not found - will try to continue without upload");
    }

    const fileInputCss = selectors?.resume_file_input_css || "input[type='file']";
    const fileInputXpath = selectors?.resume_file_input_xpath || ".//input[@type='file']";
    const modalCss = selectors?.modal_container_css || "div.jobs-easy-apply-modal";

    let fileInput: Awaited<ReturnType<WebDriver['findElement']>> | null = null;
    try {
      try {
        const modal = await driver.findElement(By.css(modalCss));
        fileInput = await modal.findElement(By.css(fileInputCss));
      } catch {
        try {
          fileInput = await driver.findElement(By.css(fileInputCss));
        } catch {
          // ignore
        }
      }
      if (!fileInput) {
        try {
          fileInput = await driver.findElement(By.xpath(fileInputXpath));
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }

    if (!fileInput) {
      printLog("No file input in modal (e.g. using profile resume) - skipping upload");
      yield "resume_not_required";
      return;
    }

    if (resumePath && fs.existsSync(resumePath)) {
      await fileInput.sendKeys(resumePath);
      printLog("Resume uploaded");
      await driver.sleep(2000);
      yield "resume_uploaded_successfully";
    } else {
      printLog("No resume file to upload - continuing");
      yield "proceeding_without_resume";
    }
  } catch (error) {
    printLog(`Resume upload error: ${error} `);
    yield "proceeding_without_resume";
  }
}

// Extract employer questions from Easy Apply modal (same output shape as Seek: question, type, options, containerSelector)
export async function* extractEmployerQuestions(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    const driver = ctx.driver;
    const modalCss = ctx.selectors?.easy_apply?.modal_container_css || "div.jobs-easy-apply-modal";
    const containerCss = "div[data-test-form-element]";

    await driver.sleep(1500);

    const questionsData = await driver.executeScript(`
  const modal = document.querySelector(arguments[0]);
  if (!modal) return { questionsFound: 0, questions: [] };
  const containers = Array.from(modal.querySelectorAll(arguments[1]));
  const questions = [];
  const placeholderOpts = ['Select...', 'Please select', 'Choose...', ''];

  containers.forEach((container, index) => {
    container.setAttribute('data-linkedin-q-index', String(index));
    const containerSelector = '[data-linkedin-q-index="' + index + '"]';

    let questionText = '';
    const label = container.querySelector('label');
    if (label) questionText = (label.textContent || '').trim();
    const titleSpan = container.querySelector('[data-test-form-builder-radio-button-form-component__title], .artdeco-form-element__label');
    if (!questionText && titleSpan) questionText = (titleSpan.textContent || '').trim();
    const ariaLabel = container.querySelector('input[aria-label], textarea[aria-label], select');
    if (!questionText && ariaLabel) questionText = (ariaLabel.getAttribute('aria-label') || '').trim();
    if (!questionText) questionText = 'Question ' + (index + 1);

    const selectEl = container.querySelector('select');
    if (selectEl) {
      const options = Array.from(selectEl.options)
        .map(o => (o.textContent || o.innerText || '').trim())
        .filter(t => t && !placeholderOpts.includes(t));
      questions.push({ type: 'select', question: questionText, options: options, containerSelector: containerSelector });
      return;
    }

    const textareaEl = container.querySelector('textarea');
    if (textareaEl) {
      questions.push({ type: 'textarea', question: questionText, options: [], containerSelector: containerSelector });
      return;
    }

    const textInput = container.querySelector('input[type="text"]');
    if (textInput) {
      questions.push({ type: 'text', question: questionText, options: [], containerSelector: containerSelector });
      return;
    }

    const radioFieldset = container.querySelector('fieldset[data-test-form-builder-radio-button-form-component="true"]');
    if (radioFieldset) {
      const options = Array.from(radioFieldset.querySelectorAll('input[type="radio"]'))
        .map(r => {
          const labelEl = document.querySelector('label[for="' + r.id + '"]');
          return labelEl ? (labelEl.textContent || '').trim() : r.value || '';
        })
        .filter(Boolean);
      questions.push({ type: 'radio', question: questionText, options: options, containerSelector: containerSelector });
      return;
    }

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length > 0) {
      const options = Array.from(checkboxes).map(cb => {
        const labelEl = document.querySelector('label[for="' + cb.id + '"]');
        return labelEl ? (labelEl.textContent || '').trim() : (cb.getAttribute('aria-label') || '').trim();
      }).filter(Boolean);
      if (options.length > 0 || checkboxes.length > 0) {
        questions.push({ type: 'checkbox', question: questionText, options: options.length ? options : ['Yes'], containerSelector: containerSelector });
      }
    }
  });

  return { questionsFound: questions.length, questions: questions };
  `, modalCss, containerCss) as { questionsFound: number; questions: Array<{ type: string; question: string; options: string[]; containerSelector: string }> };

    if (questionsData && questionsData.questionsFound > 0) {
      printLog(`Found ${questionsData.questionsFound} employer questions`);

      let existingJobData: any = {};
      if (ctx.currentJobFile && fs.existsSync(ctx.currentJobFile)) {
        try {
          existingJobData = JSON.parse(fs.readFileSync(ctx.currentJobFile, 'utf-8'));
        } catch {
          // ignore
        }
      }

      const cleanQuestions = questionsData.questions.map((q: any, idx: number) => ({
        id: idx,
        q: q.question,
        type: q.type,
        opts: q.options || [],
        containerSelector: q.containerSelector
      }));

      const updated = { ...existingJobData, questions: cleanQuestions, lastUpdated: new Date().toISOString() };
      fs.writeFileSync(ctx.currentJobFile!, JSON.stringify(updated, null, 2));
      printLog(`Saved questions to ${ctx.currentJobFile} `);
      yield "employer_questions_saved";
    } else {
      printLog("No employer questions found");
      yield "no_employer_questions";
    }
  } catch (error) {
    printLog(`Extract employer questions error: ${error} `);
    yield "employer_questions_error";
  }
}

// Answer questions (Easy Apply modal – generic + intelligent answers, fill by type via Seek fillQuestionField)
export async function* answerQuestions(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  printLog("Answering questions...");

  try {
    const driver = ctx.driver;
    (ctx as any).platform = 'linkedin';

    let questions: Array<{ question: string; type: string; options: string[]; opts?: string[]; containerSelector: string }> = [];
    if (ctx.currentJobFile && fs.existsSync(ctx.currentJobFile)) {
      try {
        const jobData = JSON.parse(fs.readFileSync(ctx.currentJobFile, 'utf-8'));
        const raw = (jobData.questions || []) as Array<{ q: string; type: string; opts?: string[]; containerSelector: string }>;
        questions = raw.map((q) => ({
          question: q.q || '',
          type: q.type || 'text',
          options: q.opts || [],
          opts: q.opts,
          containerSelector: q.containerSelector || ''
        })).filter((q) => q.question && q.containerSelector);
      } catch {
        // ignore
      }
    }

    if (questions.length > 0) {
      printLog(`Using intelligent answers for ${questions.length} questions`);
      const answeredQuestions = await getIntelligentAnswers(questions, ctx);

      const jobId = (ctx.current_job as any)?.job_id || 'unknown';
      const jobDirPath = getJobArtifactDir(ctx, 'linkedin', jobId);
      const qnaResults: any[] = [];

      printLog("--- Questions and answers ---");
      for (let i = 0; i < answeredQuestions.length; i++) {
        const q = answeredQuestions[i];
        let answer: number | string | string[] | null = null;
        if (q.type === 'select' && typeof q.selectedAnswer === 'number') {
          answer = q.selectedAnswer;
        } else if (q.type === 'radio' && typeof q.selectedAnswer === 'number') {
          answer = q.selectedAnswer;
        } else if ((q.type === 'text' || q.type === 'textarea') && q.textAnswer) {
          answer = q.textAnswer;
        } else if (q.type === 'checkbox' && Array.isArray(q.selectedAnswer)) {
          answer = q.selectedAnswer;
        }

        let answerDisplay: string;
        if (answer === null || answer === undefined) {
          answerDisplay = "(skipped)";
        } else if (typeof answer === 'number' && (q.type === 'select' || q.type === 'radio') && Array.isArray(q.options)) {
          answerDisplay = q.options[answer] ?? String(answer);
        } else if (Array.isArray(answer)) {
          answerDisplay = answer.join(", ");
        } else {
          answerDisplay = String(answer);
        }
        const source = (q as any).answerSource || "unknown";
        printLog(`Q${i + 1} [${q.type}] ${q.question} `);
        printLog(`    Answer: ${answerDisplay} [${source}]`);
        logger.debug('linkedin.qa.answer_resolved', 'Resolved LinkedIn answer before filling', {
          index: i,
          question: q.question,
          type: q.type,
          source,
          answer,
          answerDisplay,
          containerSelector: q.containerSelector,
          options: q.options || q.opts || []
        });

        if (answer !== null && answer !== undefined) {
          const modalScope = "[data-test-modal-id='easy-apply-modal']";
          const fillResult = await fillQuestionFieldDetailed(ctx, q.containerSelector, q.type, answer, modalScope);
          const filled = fillResult.success;
          const options = q.options || q.opts || [];
          const selected =
            q.type === 'select' || q.type === 'radio'
              ? (typeof answer === 'number' ? answer : null)
              : q.type === 'checkbox'
                ? (Array.isArray(answer) ? answer : [answer])
                : null;
          const resolvedAnswer =
            typeof answer === 'number' && Array.isArray(options) && options[answer] != null
              ? String(options[answer])
              : Array.isArray(answer)
                ? answer.map((x: unknown) => String(x)).join(', ')
                : String(answer);
          qnaResults.push({
            question: q.question,
            type: q.type,
            options,
            selected,
            answer: resolvedAnswer,
            answerSource: (q as any).answerSource,
            status: filled ? 'success' : 'failed',
            failureReason: filled ? undefined : fillResult.failureReason,
            fillError: filled ? undefined : fillResult.error
          });
          printLog(`    Filled: ${filled ? "yes" : "no"} `);
          logger[filled ? 'info' : 'warn'](
            'linkedin.qa.fill_result',
            filled ? 'LinkedIn question filled successfully' : 'LinkedIn question fill failed',
            {
              index: i,
              question: q.question,
              type: q.type,
              containerSelector: q.containerSelector,
              resolvedAnswer,
              selected,
              options,
              failureReason: fillResult.failureReason,
              fillError: fillResult.error
            }
          );
        } else {
          logger.warn('linkedin.qa.answer_skipped', 'Skipping LinkedIn question because answer is empty', {
            index: i,
            question: q.question,
            type: q.type,
            source,
            selectedAnswer: q.selectedAnswer,
            textAnswer: q.textAnswer,
            options: q.options || q.opts || []
          });
        }
        await driver.sleep(300);
      }
      printLog("--- End questions and answers ---");

      if (!fs.existsSync(jobDirPath)) {
        fs.mkdirSync(jobDirPath, { recursive: true });
      }
      fs.writeFileSync(
        path.join(jobDirPath, 'qna.json'),
        JSON.stringify({ questions: qnaResults }, null, 2)
      );
      printLog("Questions answered (intelligent flow)");
    } else {
      const modalCss = ctx.selectors?.easy_apply?.modal_container_css || "div.jobs-easy-apply-modal";
      const phone = ctx.config.formData?.phone || '';
      const email = ctx.config.formData?.email || '';
      let root: Awaited<ReturnType<WebDriver['findElement']>> = driver as any;
      try {
        root = await driver.findElement(By.css(modalCss));
      } catch {
        // no modal
      }
      const formElements = await root.findElements(By.css("div[data-test-form-element]"));
      for (const element of formElements) {
        try {
          const textInputs = await element.findElements(By.css('input[type="text"]'));
          for (const input of textInputs) {
            const label = (await input.getAttribute('aria-label')) || (await input.getAttribute('placeholder')) || '';
            const l = label.toLowerCase();
            if (phone && l.includes('phone')) {
              await input.clear();
              await input.sendKeys(phone);
            } else if (email && l.includes('email')) {
              await input.clear();
              await input.sendKeys(email);
            }
          }
          const selects = await element.findElements(By.css('select'));
          for (const select of selects) {
            try {
              const options = await select.findElements(By.css('option'));
              if (options.length > 1) await options[1].click();
            } catch {
              // ignore
            }
          }
          const radios = await element.findElements(By.css('input[type="radio"]'));
          if (radios.length > 0) {
            try {
              await radios[0].click();
            } catch {
              // ignore
            }
          }
        } catch {
          continue;
        }
      }
      printLog("Questions answered (basic flow)");
    }

    // Multi-stage: if primary button is Next/Continue/Review, click it and loop to extract next stage questions
    // Must scope to Easy Apply overlay only so we never match pagination "View next page" behind the modal
    let modalRoot: Awaited<ReturnType<WebDriver['findElement']>> | null = null;
    try {
      modalRoot = await driver.findElement(By.css("[data-test-modal-id='easy-apply-modal']"));
    } catch {
      try {
        modalRoot = await driver.findElement(By.css(ctx.selectors?.easy_apply?.modal_container_css || "div.jobs-easy-apply-modal"));
      } catch {
        // no modal
      }
    }
    if (!modalRoot) {
      yield "finished_answering_questions";
      return;
    }
    const nextXPathRel = ".//button[contains(., 'Next') or contains(., 'Continue') or contains(., 'Review')]";
    const submitXPathRel = ".//button[contains(., 'Submit application') or contains(., 'Submit')]";
    let primaryButton: Awaited<ReturnType<WebDriver['findElement']>> | null = null;
    let primaryText = '';
    try {
      const submitBtn = await modalRoot.findElement(By.xpath(submitXPathRel));
      if (submitBtn) {
        const isDisplayed = await submitBtn.isDisplayed();
        const isEnabled = await submitBtn.isEnabled();
        if (isDisplayed && isEnabled) {
          primaryButton = submitBtn;
          primaryText = (await submitBtn.getText())?.trim() || '';
        }
      }
    } catch {
      // submit not found
    }
    if (!primaryButton) {
      try {
        const nextBtn = await modalRoot.findElement(By.xpath(nextXPathRel));
        if (nextBtn) {
          const ariaLabel = (await nextBtn.getAttribute("aria-label")) || "";
          const className = (await nextBtn.getAttribute("class")) || "";
          const isPagination = ariaLabel.includes("View next page") || className.includes("jobs-search-pagination");
          if (!isPagination) {
            const isDisplayed = await nextBtn.isDisplayed();
            const isEnabled = await nextBtn.isEnabled();
            if (isDisplayed && isEnabled) {
              primaryButton = nextBtn;
              primaryText = (await nextBtn.getText())?.trim() || '';
            }
          }
        }
      } catch {
        // next not found
      }
    }
    const isSubmit = primaryText && (primaryText.includes('Submit') || primaryText.includes('Done'));
    if (primaryButton && !isSubmit) {
      await primaryButton.click();
      printLog(`Clicked "${primaryText}" – advancing to next stage`);
      await driver.sleep(2000);
      yield "next_stage";
      return;
    }
    yield "finished_answering_questions";
  } catch (error) {
    printLog(`Error answering questions: ${error} `);
    yield "error_answering_questions";
  }
}

// Submit application (Easy Apply modal – use easy_apply selectors, scope to modal)
export async function* submitApplication(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  printLog("Submitting application...");

  try {
    const driver = ctx.driver;
    const currentJob = ctx.current_job;
    const easyApply = ctx.selectors?.easy_apply;
    // Scope to Easy Apply overlay so we never click pagination "View next page" behind the modal
    const nextButtonXPathRel = ".//button[contains(., 'Next') or contains(., 'Continue')]";
    const submitButtonXPathRel = ".//button[contains(., 'Submit application') or contains(., 'Submit')]";

    let root: Awaited<ReturnType<WebDriver['findElement']>> | null = null;
    try {
      root = await driver.findElement(By.css("[data-test-modal-id='easy-apply-modal']"));
    } catch {
      try {
        root = await driver.findElement(By.css(easyApply?.modal_container_css || "div.jobs-easy-apply-modal"));
      } catch {
        // no modal
      }
    }

    const findNext = async () => {
      if (root) {
        try {
          return await root.findElement(By.xpath(nextButtonXPathRel));
        } catch {
          return null;
        }
      }
      return null;
    };
    const findSubmit = async () => {
      if (root) {
        try {
          return await root.findElement(By.xpath(submitButtonXPathRel));
        } catch {
          return null;
        }
      }
      return null;
    };

    let nextCount = 0;
    while (nextCount < 5) {
      const nextButton = await findNext();
      if (!nextButton) break;
      const buttonText = (await nextButton.getText())?.trim() || '';
      if (buttonText.includes('Submit') || buttonText.includes('Done')) break;
      await nextButton.click();
      printLog(`Clicked "${buttonText}" button(${nextCount + 1})`);
      await driver.sleep(2000);
      nextCount++;
    }

    const submitButton = await findSubmit();
    if (submitButton) {
      await submitButton.click();
      printLog("Application submitted");
      await driver.sleep(3000);

      ctx.applied_jobs = (ctx.applied_jobs || 0) + 1;

      if (ctx.overlay) {
        await ctx.overlay.updateJobProgress(
          ctx.applied_jobs,
          ctx.total_jobs || 0,
          `Applied: ${currentJob?.title || 'Job'} `,
          17
        ).catch(() => { });
      }

      yield "save_applied_job";
    } else {
      printLog("Submit button not found - modal may not have proper form");
      yield "application_failed";
    }
  } catch (error) {
    printLog(`Submit error: ${error} `);
    yield "application_failed";
  }
}

// Save applied job (persist applied ID and record to backend)
export async function* saveAppliedJob(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  printLog("Saving applied job...");

  try {
    const currentJob = ctx.current_job;
    const appliedJobIds = ctx.applied_job_ids || new Set();

    if (currentJob && currentJob.job_id) {
      appliedJobIds.add(currentJob.job_id);
      ctx.applied_job_ids = appliedJobIds;

      const jobIdsPath = path.join(process.cwd(), 'deknilJobsIds.json');
      fs.writeFileSync(jobIdsPath, JSON.stringify(Array.from(appliedJobIds), null, 2));

      const jobId = currentJob.job_id;
      const jobDirPath = getJobArtifactDir(ctx, 'linkedin', jobId);
      const jobFilePath = path.join(jobDirPath, 'job_details.json');
      if (fs.existsSync(jobFilePath)) {
        try {
          const result = await recordJobApplicationToBackend({
            jobFilePath,
            jobDirPath,
            platform: 'linkedin'
          });
          if (!result.ok) {
            printLog(`[JobRecorder] Backend record skipped: ${result.error} `);
          }
        } catch (recordErr) {
          printLog(`[JobRecorder] Record failed(continuing): ${recordErr} `);
        }
      }

      printLog(`Saved job ID: ${jobId} `);
      yield "job_saved";
    } else {
      yield "save_job_failed";
    }
  } catch (error) {
    printLog(`Error saving job: ${error} `);
    yield "save_job_failed";
  }
}

// External apply - Extract job details and save to JSON
export async function* externalApply(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    const driver = ctx.driver;
    const currentJob = ctx.current_job;

    if (!currentJob) {
      yield "application_failed";
      return;
    }

    // Extract full job details from panel
    const jobDetails: any = {
      job_id: currentJob.job_id,
      title: currentJob.title,
      company: currentJob.company,
      location: currentJob.work_location || '',
      extracted_at: new Date().toISOString(),
      apply_type: 'external'
    };

    // Extract description
    try {
      const descElement = await driver.findElement(By.css('div.jobs-description__content'));
      jobDetails.description = (await descElement.getText()).trim();
    } catch (error) {
      jobDetails.description = '';
    }

    // Extract job URL
    try {
      const currentUrl = await driver.getCurrentUrl();
      jobDetails.url = currentUrl;
    } catch (error) {
      jobDetails.url = '';
    }

    // Save to JSON file
    const jobDirPath = getJobArtifactDir(ctx, 'linkedin', currentJob.job_id);
    const filepath = path.join(jobDirPath, 'job_details.json');
    fs.writeFileSync(filepath, JSON.stringify(jobDetails, null, 2));

    ctx.skipped_jobs = (ctx.skipped_jobs || 0) + 1;

    await ctx.overlay.updateJobProgress(
      ctx.applied_jobs || 0,
      ctx.total_jobs || 0,
      "External job saved",
      19
    );

    yield "save_external_job";
  } catch (error) {
    yield "application_failed";
  }
}

// Save external job
export async function* saveExternalJob(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  yield "external_job_saved";
}

// Application failed
export async function* applicationFailed(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const currentJob = ctx.current_job;

  if (currentJob) {
    ctx.skipped_jobs = (ctx.skipped_jobs || 0) + 1;

    await ctx.overlay.updateJobProgress(
      ctx.applied_jobs || 0,
      ctx.total_jobs || 0,
      "Application failed",
      21
    );
  }

  yield "application_marked_failed";
}

// Continue processing
export async function* continueProcessing(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const extractedJobs = ctx.extracted_jobs || [];
  const currentIndex = ctx.current_job_index || 0;

  if (currentIndex < extractedJobs.length - 1) {
    const nextIndex = currentIndex + 1;
    ctx.current_job_index = nextIndex;
    ctx.current_job = extractedJobs[nextIndex];

    yield "starting_next_application";
  } else {
    yield "navigate_to_next_page";
  }
}

// Navigate to next page
export async function* navigateToNextPage(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    const driver = ctx.driver;
    const currentPage = ctx.pagination_current_page || 1;

    try {
      const nextPageButton = await driver.findElement(By.css(`button[aria-label="Page ${currentPage + 1}"]`));
      await nextPageButton.click();
      printLog(`Page ${currentPage + 1} `);
      await driver.sleep(3000);

      ctx.pagination_current_page = currentPage + 1;
      ctx.current_job_index = 0;
      ctx.current_job = null;
      ctx.extracted_jobs = [];
      await ctx.overlay.addLogEvent(`Navigated to LinkedIn page ${currentPage + 1}`);
      yield "extract_job_details";
    } catch (error) {
      yield "finish";
    }
  } catch (error) {
    yield "finish";
  }
}

// Finish
export async function* finish(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    const appliedCount = ctx.applied_jobs || 0;
    const skippedCount = ctx.skipped_jobs || 0;
    const totalCount = ctx.total_jobs || 0;

    printLog(`Workflow complete: Applied ${appliedCount}, Skipped ${skippedCount}, Total ${totalCount} `);

    if (ctx.overlay) {
      await ctx.overlay.updateJobProgress(
        appliedCount,
        totalCount,
        "Workflow completed!",
        24
      );
    }
  } catch (error) {
    printLog(`Finish error: ${error} `);
  }

  yield "done";
}

// Export step functions
export const linkedinStepFunctions = {
  step0,
  navigateToDirectApplyUrl,
  openCheckLogin,
  credentialLogin,
  showManualLoginPrompt,
  openJobsPage,
  setSearchLocation,
  setSearchKeywords,
  applyFilters,
  getPageInfo,
  extractJobDetails,
  processJobs,
  openCurrentExtractJobCard,
  saveLinkedInScrapedJob,
  advanceExtractCursor,
  attemptEasyApply,
  extractJobDetailsFromPanel,
  uploadResume,
  handleCoverLetter,
  extractEmployerQuestions,
  answerQuestions,
  submitApplication,
  saveAppliedJob,
  externalApply,
  saveExternalJob,
  applicationFailed,
  continueProcessing,
  navigateToNextPage,
  finish
};
