import { WebDriver, By, Key } from 'selenium-webdriver';
import { setupChromeDriver } from '../core/browser_manager';
import { HumanBehavior, StealthFeatures, DEFAULT_HUMANIZATION } from '../core/humanization';
import { UniversalSessionManager, SessionConfigs } from '../core/sessionManager';
import { UniversalOverlay } from '../core/universal_overlay';
import type { WorkflowContext } from '../core/workflow_engine';
import { waitForNextConfirm } from '../core/pause_confirm';
import { apiRequest } from '../core/api_client';
import { handleResumeSelection } from './handlers/resume_handler';
import { handleCoverLetter } from './handlers/cover_letter_handler';
import { answerEmployerQuestions as handleEmployerQuestions } from './handlers/answer_employer_questions';
import { extractEmployerQuestions } from './handlers/extract_employer_questions';
import { recordJobApplicationToBackend, getJobDirPathFromJobFile } from '../core/job_application_recorder';
import { getJobArtifactDir, getClientEmailFromContext, getJobArtifactCandidates } from '../core/client_paths';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { loadUserConfig } from '../core/config_loader';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const BASE_URL = "https://www.seek.com.au";

const printLog = (message: string) => {
  console.log(`[DEV] ${message}`);
};

/** User-facing log — shown on the Bot Dashboard. Keep these clean and minimal. */
const userLog = (message: string) => {
  console.log(message);
};

/**
 * Parse HR contact, required skills, and required experience from job details text.
 * Used so Job Analytics can show these in the Job details tab.
 */
function parseJobDetailsFromText(details: string): {
  hrContact?: { name?: string; email?: string; phone?: string };
  requiredSkills?: string[];
  requiredExperience?: string;
} {
  const result: {
    hrContact?: { name?: string; email?: string; phone?: string };
    requiredSkills?: string[];
    requiredExperience?: string;
  } = {};
  if (!details || typeof details !== 'string') return result;

  const text = details.trim();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // --- Email ---
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const emails = text.match(emailRegex);
  if (emails && emails.length > 0) {
    result.hrContact = result.hrContact || {};
    result.hrContact.email = emails[0];
  }

  // --- Phone (AU-style and generic) ---
  const phoneRegex = /(?:\+61|0)[\s.-]?\(?\d\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b|\+\d{1,3}[\s.-]?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{2,4}\b|\b\d{8,10}\b/g;
  const phones = text.match(phoneRegex);
  if (phones && phones.length > 0) {
    result.hrContact = result.hrContact || {};
    result.hrContact.phone = phones[0].replace(/\s+/g, ' ').trim();
  }

  // --- Contact / Recruiter name (e.g. "Contact: John Smith", "Recruiter: Jane") ---
  const contactNamePatterns = [
    /(?:Contact|Recruiter|HR|Enquiries?)\s*[:\-]\s*([A-Za-z][A-Za-z\s.]{1,50}?)(?:\s*[|\n]|$)/i,
    /(?:contact|reach)\s+(?:me\s+at\s+)?([A-Za-z][A-Za-z\s.]{1,50}?)(?:\s+on\s+|\s*[|\n]|$)/i,
  ];
  for (const re of contactNamePatterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const name = m[1].replace(/\s+/g, ' ').trim();
      if (name.length >= 2 && name.length <= 60) {
        result.hrContact = result.hrContact || {};
        result.hrContact.name = name;
        break;
      }
    }
  }

  // --- Required skills: look for section then bullets or comma list; also inline "Skills: A, B, C" ---
  const skillInlineRegex = /^(?:Key\s+)?(?:Skills?|Technical\s+skills?|What\s+you'll\s+need|Essential\s+skills?)\s*[:\-]\s*(.+)$/i;
  const skillSectionHeaders = /^(?:Key\s+)?(?:Skills?|Requirements?|Technical\s+skills?|What\s+you'll\s+need|Essential\s+skills?)\s*[:\-]?\s*$/i;
  const bulletOrDash = /^[\s]*[-•*]\s+(.+)$/;
  const skillLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const inlineMatch = line.match(skillInlineRegex);
    if (inlineMatch && inlineMatch[1].trim()) {
      const rest = inlineMatch[1].split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      skillLines.push(...rest);
      continue;
    }
    if (skillSectionHeaders.test(line)) {
      // Next line(s) may be the list
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j];
        if (/^(?:About|Responsibilities?|Experience|Benefits?|Apply)\s*[:\-]?/i.test(next) || next.length > 120) break;
        const bullet = next.match(bulletOrDash);
        if (bullet) skillLines.push(bullet[1].trim());
        else if (next.includes(',') && next.length < 200) skillLines.push(...next.split(',').map((s) => s.trim()).filter(Boolean));
        else if (next.length > 2 && next.length < 80 && !/^\d+\.?\s*$/.test(next)) skillLines.push(next);
      }
      break;
    }
  }
  if (skillLines.length > 0) {
    result.requiredSkills = [...new Set(skillLines)].slice(0, 50);
  }

  // --- Required experience: "X years' experience", "minimum X years", or block under "Experience:" ---
  const experiencePhrases: string[] = [];
  const yearsRegex = /(\d+\+?\s*(?:to\s+)?\d*\s*years?'?\s*(?:of\s+)?(?:experience|exp\.?|in\s+[A-Za-z\s]+))/gi;
  const minYearsRegex = /(?:minimum|at\s+least|min\.?)\s+\d+\+?\s*years?'?\s*(?:of\s+)?(?:experience|exp\.?)?/gi;
  for (const re of [yearsRegex, minYearsRegex]) {
    const matches = text.match(re);
    if (matches) experiencePhrases.push(...matches.map((m) => m.trim()));
  }
  const experienceHeader = /^(?:Experience|What\s+you'll\s+bring|Requirements?)\s*[:\-]?\s*$/i;
  let inExpSection = false;
  const expLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (experienceHeader.test(line)) {
      inExpSection = true;
      continue;
    }
    if (inExpSection && line.length > 10 && line.length < 500) {
      if (/^(?:About|Responsibilities?|Skills?|Benefits?|Apply)\s*[:\-]?/i.test(line)) break;
      expLines.push(line);
    }
  }
  if (experiencePhrases.length > 0 || expLines.length > 0) {
    const combined = [...experiencePhrases, ...expLines.slice(0, 5)].filter(Boolean);
    result.requiredExperience = combined.join(' ');
  }

  return result;
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
        // Remove the keyword and any surrounding separators (·, -, space, brackets)
        cleaned = cleaned.replace(new RegExp(`\\s*(?:·|\\-|\\/|\\-|\\||\\(|\\))?\\s*${kw.source}\\s*(?:·|\\-|\\/|\\-|\\||\\(|\\))?\\s*`, 'i'), ' ').trim();
      }
    }
  }
  
  // Clean up any double spaces or trailing separators
  cleaned = cleaned.replace(/\s+/g, ' ').replace(/^[\s·\-\/\(\)]+|[\s·\-\/\(\)]+$/g, '').trim();
  
  return { cleanedLocation: cleaned, workplaceType };
}

/** Log current job from context so you always know which job the bot is applying to. */
function logCurrentJob(ctx: WorkflowContext): void {
  const title = ctx.currentJobTitle ?? ctx.currentJobTitlePreview;
  const company = ctx.currentJobCompany ?? ctx.currentJobCompanyPreview;
  if (title || company) {
    printLog(`🎯 Current job: ${title || '?'} at ${company || '?'}`);
  }
}

function slugify(text: string): string {
  if (!text) return "";
  text = text.trim().toLowerCase();
  text = text.replace(/[^a-z0-9]+/g, "-");
  text = text.replace(/-+/g, "-");
  return text.replace(/^-|-$/g, "");
}

// Build search URL from keywords, location, and filters
function build_search_url(base_url: string, keywords: string, location: string, filters?: {
  jobType?: string,
  remotePreference?: string,
  listedDate?: string,
  minSalary?: string,
  maxSalary?: string
}): string {
  const keyword_slug = slugify(keywords);
  const location_slug = slugify(location);

  let search_path = keyword_slug ? `/${keyword_slug}-jobs` : "/jobs";
  if (location_slug) {
    search_path += `/in-${location_slug}`;
  }

  const url = new URL(`${base_url}${search_path}`);

  if (filters) {
    if (filters.jobType && filters.jobType !== 'any') {
      // Seek uses worktype=Full+Time etc.
      url.searchParams.append('worktype', filters.jobType);
    }
    if (filters.remotePreference && filters.remotePreference !== 'any') {
      // Seek uses where=Remote or similar; sometimes it's better to just use the DOM for this
      // but let's try to add it if it's 'remote'
      if (filters.remotePreference === 'remote') {
        url.searchParams.append('whereid', '0');
        url.searchParams.append('where', 'Remote');
      }
    }
    if (filters.listedDate) {
      // map 'today', '3d', '7d', '14d', '30d' to dateRange values
      const dateMap: Record<string, string> = {
        'today': '1',
        '3d': '3',
        '7d': '7',
        '14d': '14',
        '30d': '31'
      };
      const mapped = dateMap[filters.listedDate.toLowerCase()];
      if (mapped) url.searchParams.append('daterange', mapped);
    }
    if (filters.minSalary || filters.maxSalary) {
      const min = filters.minSalary || '0';
      const max = filters.maxSalary || '999999';
      url.searchParams.append('salaryrange', `${min}-${max}`);
      url.searchParams.append('salarytype', 'annual');
    }
  }

  return url.toString();
}

function normalize_seek_direct_url(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();
    if (!host.includes('seek.com.au')) return rawUrl;

    // Some stored URLs are search result links with ?jobId=...; convert to canonical job URL.
    const queryJobId = u.searchParams.get('jobId');
    if (queryJobId && /^\d+$/.test(queryJobId)) {
      return `${u.protocol}//${u.host}/job/${queryJobId}`;
    }

    // Already a canonical job URL.
    if (/\/job\/\d+/.test(u.pathname)) {
      return rawUrl;
    }
  } catch {
    // Keep original when URL parsing fails.
  }
  return rawUrl;
}

// Step 0: Initialize Context
export async function* step0(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const selectors = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/seek_selectors.json'), 'utf8'));
  const runtimeConfig = ((ctx.config as any) || {}) as Record<string, any>;
  const fileConfig = loadUserConfig();


  // Capture maxJobsToProcess from runtime config BEFORE overwriting ctx.config
  const runtimeLimit = runtimeConfig?.maxJobsToProcess;
  ctx.maxJobsLimit = runtimeLimit ? Number(runtimeLimit) : 0;  // 0 = no limit

  // *** Capture directApplyUrl BEFORE ctx.config is overwritten with fileConfig ***
  const directApplyUrl = runtimeConfig?.directApplyUrl as string | undefined;
  const targetJobId = runtimeConfig?.targetJobId as string | undefined;

  // Merge runtime config over disk config so UI-submitted values win.
  // This prevents blank file values from overriding live form inputs.
  const mergedConfig = {
    ...fileConfig,
    ...runtimeConfig,
    formData: {
      ...(fileConfig?.formData || {}),
      ...(runtimeConfig?.formData || {})
    }
  };

  ctx.selectors = selectors;
  ctx.config = mergedConfig;
  const mergedKeywords = String(mergedConfig?.formData?.keywords || mergedConfig?.formData?.keyword || '').trim();
  const mergedLocations = String(mergedConfig?.formData?.locations || mergedConfig?.formData?.location || mergedConfig?.formData?.where || '').trim();
  const jobType = String(mergedConfig?.formData?.jobType || 'any').trim();
  const remotePreference = String(mergedConfig?.formData?.remotePreference || 'any').trim();
  const listedDate = String(mergedConfig?.formData?.listedDate || '').trim();
  const minSalary = String(mergedConfig?.formData?.minSalary || '').trim();
  const maxSalary = String(mergedConfig?.formData?.maxSalary || '').trim();

  printLog(`Config values loaded: keywords='${mergedKeywords}', locations='${mergedLocations}', jobType='${jobType}', remote='${remotePreference}'`);
  userLog(`🔍 Searching: ${mergedKeywords || 'all jobs'}${mergedLocations ? ` in ${mergedLocations}` : ''}${jobType !== 'any' ? ` (${jobType})` : ''}`);
  ctx.seek_url = build_search_url(BASE_URL, mergedKeywords, mergedLocations, {
    jobType,
    remotePreference,
    listedDate,
    minSalary,
    maxSalary
  });

  // Override seek_url if direct apply mode
  if (targetJobId) {
    const jobDirs = getJobArtifactCandidates(ctx, 'seek', targetJobId);
    let foundJobDetail = false;
    for (const d of jobDirs) {
      const p = path.join(d, 'job_details.json');
      if (fs.existsSync(p)) {
        const jobData = JSON.parse(fs.readFileSync(p, 'utf8'));
        ctx.currentJobFile = p;
        ctx.currentJobDir = d;
        ctx.currentJobTitle = jobData.title || '';
        ctx.currentJobCompany = jobData.company || '';
        
        if (jobData.url) {
           ctx.seek_url = jobData.url;
        } else {
           ctx.seek_url = directApplyUrl ? normalize_seek_direct_url(directApplyUrl) : `https://www.seek.com.au/job/${targetJobId}`;
        }
        printLog(`🎯 Direct Apply mode via Job ID. Using exact URL from extracted JSON: ${ctx.seek_url} (Found in ${p})`);
        foundJobDetail = true;
        break;
      }
    }
    
    if (!foundJobDetail && directApplyUrl) {
      const normalizedDirectApplyUrl = normalize_seek_direct_url(directApplyUrl);
      ctx.seek_url = normalizedDirectApplyUrl;
      printLog(`⚠️ targetJobId supplied but job_details.json missing! Falling back to raw URL: ${normalizedDirectApplyUrl}`);
    }
  } else if (directApplyUrl) {
    const normalizedDirectApplyUrl = normalize_seek_direct_url(directApplyUrl);
    ctx.seek_url = normalizedDirectApplyUrl;
    printLog(`🎯 Direct Apply mode detected (legacy URL). Bypassing search and targeting URL: ${normalizedDirectApplyUrl}`);
  }

  // Initialize retry counters to prevent infinite loops
  ctx.retry_counts = {
    page_load_retries: 0,
    refresh_retries: 0,
    collect_cards_retries: 0,
    MAX_PAGE_LOAD_RETRIES: 3,
    MAX_REFRESH_RETRIES: 2,
    MAX_COLLECT_CARDS_RETRIES: 5
  };

  // Initialize jobs extracted counters (tracks across pages)
  ctx.jobs_extracted = 0;
  ctx.jobs_internal = 0;
  ctx.jobs_external = 0;

  if (directApplyUrl) {
    yield "direct_apply_ready";
  } else {
    printLog(`Search URL: ${ctx.seek_url}`);
    if (ctx.maxJobsLimit > 0) {
      userLog(`🎯 Will extract up to ${ctx.maxJobsLimit} jobs`);
    }
    yield "ctx_ready";
  }
}

// Step 0.5: Open Job URL Directly
export async function* openJobUrl(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    if (ctx.driver) {
      printLog("⚠️ Browser already exists, reusing existing instance");
      await ctx.driver.get(ctx.seek_url);
      await ctx.driver.sleep(5000);
      // Show overlay on existing driver too
      if (ctx.overlay) {
        try {
          await ctx.overlay.updateJobProgress(0, 1, 'Opening Job Page…', 1);
          await ctx.overlay.addLogEvent(`🔗 Navigating to: ${ctx.seek_url}`);
        } catch (e) { /* overlay not critical */ }
      }
      yield "job_url_opened";
      return;
    }

    const { driver, sessionExists, sessionsDir } = await setupChromeDriver('seek');
    ctx.driver = driver;
    ctx.sessionExists = sessionExists;
    ctx.sessionsDir = sessionsDir;
    ctx.humanBehavior = new HumanBehavior(DEFAULT_HUMANIZATION);
    ctx.sessionManager = new UniversalSessionManager(driver, SessionConfigs.seek);
    ctx.overlay = new UniversalOverlay(driver, 'Seek');

    await StealthFeatures.hideWebDriver(driver);
    await StealthFeatures.randomizeUserAgent(driver);

    printLog(`Opening Direct Job URL (prio): ${ctx.seek_url}`);
    // Start navigation BEFORE initializing overlay to avoid clear & flicker
    await driver.get(ctx.seek_url);

    // Now initialize overlay — it will show up on the loading/loaded page
    try {
      await ctx.overlay.initialize();
      await ctx.overlay.showJobProgress(0, 1, 'Starting Seek bot...', 0);
      
      await driver.executeScript(`
        sessionStorage.removeItem('universal_overlay_state');
        window.__overlaySystemInitialized = false;
      `);
    } catch (e) { /* overlay not critical */ }

    await driver.sleep(5000);

    const currentUrl = await ctx.driver.getCurrentUrl();
    const title = await driver.getTitle();

    if (currentUrl && title && !title.includes('error')) {
      // Initialize the overlay and show it on the loaded job page
      try {
        await ctx.overlay.updateJobProgress(0, 1, '🎯 Direct Apply Mode — Job Loaded', 1);
        await ctx.overlay.addLogEvent(`🔗 URL: ${ctx.seek_url}`);
        await ctx.overlay.addLogEvent('🔍 Looking for Quick Apply button…');
        printLog('✅ Overlay initialized on job page');
      } catch (overlayErr) {
        printLog(`⚠️ Overlay init skipped: ${overlayErr}`);
      }
      yield "job_url_opened";
    } else {
      printLog("Direct Job URL load failed - will retry");
      yield "job_url_failed";
    }
  } catch (error) {
    printLog(`Direct URL opening failed: ${error}`);
    yield "job_url_failed";
  }
}

// Step 1: Open Homepage
export async function* openHomepage(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    // CRITICAL: Prevent multiple browser instances
    if (ctx.driver) {
      printLog("⚠️ Browser already exists, reusing existing instance");
      
      // CRITICAL: Check if driver session is still valid before reusing
      const driverValid = await isDriverSessionValid(ctx.driver);
      if (!driverValid) {
        printLog("❌ Existing driver session is invalid - recreating driver...");
        const recreated = await recreateDriverAndRestoreContext(ctx);
        if (!recreated) {
          printLog("❌ Failed to recreate driver - cannot continue");
          yield "page_navigation_failed";
          return;
        }
        printLog("✅ Driver recreated successfully");
        // Continue with new driver below
      } else {
        // Driver is valid - ALWAYS re-register recovery callback with current context
        // This ensures the callback always has access to the current context, not a stale one
        printLog("🔧 Registering/updating recovery callback on existing driver with current context");
        (ctx.driver as any).__recoverDriver = async () => {
          return await recreateDriverAndRestoreContext(ctx);
        };
        
      // Just navigate to the URL instead of creating new browser
      await ctx.driver.get(ctx.seek_url || `${BASE_URL}/jobs`);
      await ctx.driver.sleep(5000);

      const currentUrl = await ctx.driver.getCurrentUrl();
      const title = await ctx.driver.getTitle();

      printLog(`Current URL: ${currentUrl}`);
      printLog(`Page title: ${title}`);

      if (currentUrl && title && !title.includes('error')) {
        yield "homepage_opened";
      } else {
        yield "page_navigation_failed";
      }
      return;
      }
    }

    const { driver, sessionExists, sessionsDir } = await setupChromeDriver('seek');
    ctx.driver = driver;
    ctx.sessionExists = sessionExists;
    ctx.sessionsDir = sessionsDir;
    ctx.humanBehavior = new HumanBehavior(DEFAULT_HUMANIZATION);
    ctx.sessionManager = new UniversalSessionManager(driver, SessionConfigs.seek);
    ctx.overlay = new UniversalOverlay(driver, 'Seek');

    // Register recovery callback for browser monitoring
    (driver as any).__recoverDriver = async () => {
      return await recreateDriverAndRestoreContext(ctx);
    };

    await StealthFeatures.hideWebDriver(driver);
    await StealthFeatures.randomizeUserAgent(driver);

    printLog(`Opening URL (prio): ${ctx.seek_url || `${BASE_URL}/jobs`}`);
    // Start navigation BEFORE initializing overlay to avoid clear & flicker
    await driver.get(ctx.seek_url || `${BASE_URL}/jobs`);

    // Now initialize overlay — it will show up on the loading/loaded page
    try {
      await ctx.overlay.initialize();
      await ctx.overlay.showJobProgress(0, 0, 'Starting Seek bot...', 0);
      
      // Clear stale overlay state from any previous run so the fresh overlay shows correctly
      await driver.executeScript(`
        sessionStorage.removeItem('universal_overlay_state');
        window.__overlaySystemInitialized = false;
      `);
    } catch (e) { /* overlay not critical */ }

    // Wait longer for slow networks
    printLog("Waiting for page to load...");
    await driver.sleep(5000);

    // Check if page loaded successfully
    const currentUrl = await driver.getCurrentUrl();
    const title = await driver.getTitle();

    printLog(`Current URL: ${currentUrl}`);
    printLog(`Page title: ${title}`);

    if (currentUrl && title && !title.includes('error')) {
      yield "homepage_opened";
    } else {
      printLog("Page load failed - will retry");
      yield "page_navigation_failed";
    }
  } catch (error) {
    printLog(`Homepage opening failed: ${error}`);
    yield "page_navigation_failed";
  }
}

// Step 2: Wait For Page Load
export async function* waitForPageLoad(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  await ctx.driver.sleep(2000);
  const title = await ctx.driver.getTitle();

  if (title.toLowerCase().includes('seek')) {
    // Reset retry counter on success
    ctx.retry_counts.page_load_retries = 0;
    yield "page_loaded";
  } else {
    ctx.retry_counts.page_load_retries = (ctx.retry_counts.page_load_retries || 0) + 1;

    if (ctx.retry_counts.page_load_retries >= ctx.retry_counts.MAX_PAGE_LOAD_RETRIES) {
      printLog(`❌ Max page load retries (${ctx.retry_counts.MAX_PAGE_LOAD_RETRIES}) reached. Giving up.`);
      yield "page_load_failed_permanently";
    } else {
      printLog(`⚠️ Page load retry ${ctx.retry_counts.page_load_retries}/${ctx.retry_counts.MAX_PAGE_LOAD_RETRIES}`);
      yield "page_load_retry";
    }
  }
}

// Step 2.5: Refresh Page
export async function* refreshPage(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    if (!ctx.driver) {
      printLog("No driver available for refresh");
      yield "no_page_to_refresh";
      return;
    }

    ctx.retry_counts.refresh_retries = (ctx.retry_counts.refresh_retries || 0) + 1;

    if (ctx.retry_counts.refresh_retries > ctx.retry_counts.MAX_REFRESH_RETRIES) {
      printLog(`❌ Max refresh retries (${ctx.retry_counts.MAX_REFRESH_RETRIES}) reached. Giving up.`);
      yield "refresh_failed_permanently";
      return;
    }

    printLog(`Refreshing page... (attempt ${ctx.retry_counts.refresh_retries}/${ctx.retry_counts.MAX_REFRESH_RETRIES})`);
    await ctx.driver.navigate().refresh();

    // Wait longer for slow networks
    printLog("Waiting after refresh...");
    await ctx.driver.sleep(5000);

    // Check if refresh worked
    const currentUrl = await ctx.driver.getCurrentUrl();
    const title = await ctx.driver.getTitle();

    printLog(`After refresh - URL: ${currentUrl}, Title: ${title}`);

    if (currentUrl && title && !title.includes('error')) {
      // Reset retry counter on success
      ctx.retry_counts.refresh_retries = 0;
      yield "page_refreshed";
    } else {
      printLog("Refresh failed - will retry");
      yield "page_reload_failed";
    }
  } catch (error) {
    printLog(`Refresh failed: ${error}`);
    yield "page_reload_failed";
  }
}

// Step 3: Detect Page State
export async function* detectPageState(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  await ctx.driver.sleep(2000);
  const pageSource = await ctx.driver.getPageSource();
  const hasSignIn = pageSource.includes('data-automation="sign in"') || pageSource.includes('Sign in');
  yield hasSignIn ? "sign_in_required" : "logged_in";
}

// Step 3.2: Fill search form fields from user configuration (keywords/location)
export async function* fillSearchForm(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    const formData = ((ctx.config as any)?.formData || {}) as Record<string, string>;
    const keywords = String(formData.keywords || formData.keyword || '').trim();
    const location = String(formData.locations || formData.location || formData.where || '').trim();

    const keywordSelectors = (ctx.selectors?.keywords || [
      '#keywords-input',
      'input[name="keywords"]',
      '[data-automation="searchKeywordsField"] input'
    ]) as string[];

    const locationSelectors = (ctx.selectors?.location || [
      '#SearchBar__Where',
      'input[name="where"]',
      'input[data-automation="SearchBar__Where"]',
      '[data-automation="whereFieldOptions"] input[name="where"]'
    ]) as string[];

    type InputSetResult = { success: boolean; selector?: string; finalValue?: string; reason?: string };
    const setInputValue = async (selectors: string[], value: string): Promise<InputSetResult> => {
      if (!value) return { success: true, reason: 'empty_value_skipped' };
      return await ctx.driver.executeScript(
        `
        const [selectors, value] = arguments;

        function setNativeValue(input, val) {
          const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
          if (descriptor && descriptor.set) descriptor.set.call(input, val);
          else input.value = val;
        }

        function setReactTrackedValue(input, val) {
          const previous = input.value;
          setNativeValue(input, val);
          // React-controlled inputs can ignore updates unless valueTracker is nudged.
          if (input && input._valueTracker && typeof input._valueTracker.setValue === 'function') {
            input._valueTracker.setValue(previous);
          }
        }

        for (const sel of selectors || []) {
          const el = document.querySelector(sel);
          if (!el || el.offsetParent === null) continue;
          try {
            // Click first to open combobox state machine on SEEK inputs.
            el.click();
            el.focus();
            setReactTrackedValue(el, '');
            el.dispatchEvent(new Event('input', { bubbles: true }));
            setReactTrackedValue(el, value);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            // Verify controlled input actually took the value.
            if ((el.value || '').trim().toLowerCase() === String(value).trim().toLowerCase()) {
              return { success: true, selector: sel, finalValue: String(el.value || '') };
            }
          } catch (e) {
            console.error('setInputValue failed for', sel, e);
          }
        }
        return { success: false, reason: 'no_selector_accepted_value' };
      `,
        selectors,
        value
      ) as InputSetResult;
    };

    printLog(`Search config values: keywords='${keywords}', location='${location}'`);

    const keywordJsResult = await setInputValue(keywordSelectors, keywords);
    const locationJsResult = await setInputValue(locationSelectors, location);
    let keywordFilled = keywordJsResult.success;
    let locationFilled = locationJsResult.success;

    printLog(
      `Keyword JS fill: success=${keywordJsResult.success}, selector='${keywordJsResult.selector || 'n/a'}', value='${keywordJsResult.finalValue || ''}', reason='${keywordJsResult.reason || ''}'`
    );
    printLog(
      `Location JS fill: success=${locationJsResult.success}, selector='${locationJsResult.selector || 'n/a'}', value='${locationJsResult.finalValue || ''}', reason='${locationJsResult.reason || ''}'`
    );

    // Fallback pass with Selenium typing for Seek combobox controls.
    if (!keywordFilled && keywords) {
      for (const sel of keywordSelectors) {
        try {
          const el = await ctx.driver.findElement(By.css(sel));
          if (!(await el.isDisplayed())) continue;
          await ctx.driver.executeScript('arguments[0].scrollIntoView({block: "center"});', el);
          await el.click();
          try {
            await el.sendKeys(Key.chord(Key.COMMAND, 'a'), Key.BACK_SPACE);
          } catch {
            await el.clear();
          }
          await el.sendKeys(keywords);
          const typedValue = (await el.getAttribute('value')) || '';
          if (!typedValue || typedValue.trim().toLowerCase() !== keywords.trim().toLowerCase()) {
            // Final fallback for React-controlled input
            await ctx.driver.executeScript(
              `
              const el = arguments[0];
              const val = arguments[1];
              const previous = el.value;
              const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
              if (descriptor && descriptor.set) descriptor.set.call(el, val);
              else el.value = val;
              if (el && el._valueTracker && typeof el._valueTracker.setValue === 'function') {
                el._valueTracker.setValue(previous);
              }
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              `,
              el,
              keywords
            );
          }
          const finalValue = (await el.getAttribute('value')) || '';
          printLog(`Keyword Selenium fill selector='${sel}' final='${finalValue}'`);
          keywordFilled = true;
          break;
        } catch (e) {
          printLog(`Keyword Selenium fill failed selector='${sel}' error='${e}'`);
          continue;
        }
      }
    }

    if (!locationFilled && location) {
      for (const sel of locationSelectors) {
        try {
          const el = await ctx.driver.findElement(By.css(sel));
          if (!(await el.isDisplayed())) continue;
          await el.click();
          await el.clear();
          await el.sendKeys(location);
          await el.sendKeys(Key.ENTER);
          const finalValue = (await el.getAttribute('value')) || '';
          printLog(`Location Selenium fill selector='${sel}' final='${finalValue}'`);
          locationFilled = true;
          break;
        } catch (e) {
          printLog(`Location Selenium fill failed selector='${sel}' error='${e}'`);
          continue;
        }
      }
    }

    // Extra commit for where field when we already set value through JS path.
    if (location && locationFilled) {
      try {
        const whereInput = await ctx.driver.findElement(By.css('#SearchBar__Where, input[name="where"]'));
        await whereInput.click();
        await whereInput.sendKeys(Key.ENTER);
      } catch {
        // no-op: continue even if Enter commit is unavailable
      }
    }


    printLog(`Search form fill result: keywords=${keywordFilled}, location=${locationFilled}`);

    if (keywordFilled && locationFilled) {
      yield "search_form_filled";
    } else {
      yield "search_form_error";
    }
  } catch (error) {
    printLog(`Search form fill error: ${error}`);
    yield "search_form_error";
  }
}

// Step 3.5: Click Search Button
export async function* clickSearchButton(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const searchSelectors = (ctx.selectors?.search_button || [
    'button[data-automation="searchButton"]',
    '#searchButton',
    'button[data-automation="searchSubmit"]',
    'button[type="submit"]',
    'input[type="submit"]'
  ]) as string[];

  let clicked = false;
  for (const selector of searchSelectors) {
    try {
      const button = await ctx.driver.findElement(By.css(selector));
      if (await button.isDisplayed()) {
        try {
          await button.click();
        } catch {
          await ctx.driver.executeScript('arguments[0].click();', button);
        }
        clicked = true;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!clicked) {
    // Fallback: commit search via Enter on where/keywords fields
    for (const sel of ['#SearchBar__Where', 'input[name="where"]', '#keywords-input', 'input[name="keywords"]']) {
      try {
        const el = await ctx.driver.findElement(By.css(sel));
        if (await el.isDisplayed()) {
          await el.click();
          await el.sendKeys(Key.ENTER);
          clicked = true;
          break;
        }
      } catch {
        continue;
      }
    }
  }

  await ctx.driver.sleep(1500);

  if (clicked) {
    yield "search_clicked";
  } else {
    yield "search_failed";
  }
}

// Step 4: Show Sign In Banner and Wait for Login
export async function* showSignInBanner(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    await ctx.overlay.showSignInOverlay();
    
    let authenticated = false;
    // Wait up to ~6 minutes (120 iterations * 3s)
    for (let i = 0; i < 120; i++) {
        await ctx.driver.sleep(3000);
        
        // Check if user clicked the "✅ I have logged in - Continue" button on the Overlay
        const isClickConfirmed = await ctx.driver.executeScript(`
            return window.__overlaySignInComplete === true || sessionStorage.getItem('overlay_signin_complete') === 'true';
        `).catch(() => false);

        // Check if "Sign in" button is gone from the header (Seek specific)
        const isLoggedIn = await ctx.driver.executeScript(`
            const pageSource = document.body.innerText;
            return !pageSource.includes('Sign in') && !document.querySelector('[data-automation="sign in"]');
        `).catch(() => false);

        if (isClickConfirmed || isLoggedIn) {
            authenticated = true;
            // Clear the state
            await ctx.driver.executeScript(`
                window.__overlaySignInComplete = false;
                sessionStorage.removeItem('overlay_signin_complete');
            `).catch(() => {});
            break;
        }
    }

    if (authenticated) {
        printLog("Login confirmed! Proceeding...");
        yield "signin_banner_shown";
    } else {
        printLog("Login timed out.");
        yield "signin_banner_retry"; // Transitions to refresh_page or finish in YAML
    }
  } catch (error) {
    printLog(`Error showing sign in banner: ${error}`);
    yield "signin_banner_retry";
  }
}

// Step 5: Basic search functionality - just click search since we already have URL with keywords/location
export async function* performBasicSearch(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  await ctx.driver.sleep(2000);
  const currentUrl = await ctx.driver.getCurrentUrl();

  const formData = ((ctx.config as any)?.formData || {}) as Record<string, string>;
  const wantedKeyword = String(formData.keywords || formData.keyword || '').trim().toLowerCase();
  const wantedLocation = String(formData.locations || formData.location || formData.where || '').trim().toLowerCase();

  const pageState = (await ctx.driver.executeScript(
    `
    const kw = document.querySelector('#keywords-input, input[name="keywords"]');
    const where = document.querySelector('#SearchBar__Where, input[name="where"]');
    const cards = document.querySelectorAll('article[data-testid="job-card"]').length;
    return {
      keywordValue: (kw && kw.value ? String(kw.value) : '').toLowerCase(),
      locationValue: (where && where.value ? String(where.value) : '').toLowerCase(),
      cards
    };
    `
  )) as { keywordValue: string; locationValue: string; cards: number };

  const keywordOk = !wantedKeyword || pageState.keywordValue.includes(wantedKeyword);
  const locationOk = !wantedLocation || pageState.locationValue.includes(wantedLocation);
  const looksLikeResults = currentUrl.includes('/jobs') || pageState.cards > 0;

  printLog(
    `Search verify: url='${currentUrl}', wantedKeyword='${wantedKeyword}', fieldKeyword='${pageState.keywordValue}', wantedLocation='${wantedLocation}', fieldLocation='${pageState.locationValue}', cards=${pageState.cards}`
  );

  if (looksLikeResults && keywordOk && locationOk) {
    yield "search_completed";
  } else {
    yield "search_failed";
  }
}

// Step 5.5: Apply filters from user configuration (job type, remote preference, listed date, salary)
export async function* applySeekFilters(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    const formData = ((ctx.config as any)?.formData || {}) as Record<string, string>;
    const filters = (ctx.selectors?.filters || {}) as any;

    const jobType = String(formData.jobType || 'any').trim().toLowerCase();
    const remotePreference = String(formData.remotePreference || 'any').trim().toLowerCase();
    const listedDate = String(formData.listedDate || '').trim().toLowerCase();
    const minSalary = String(formData.minSalary || '').trim();
    const maxSalary = String(formData.maxSalary || '').trim();

    const applyResult = await ctx.driver.executeScript(
      `
      const [filters, config] = arguments;

      function clickIfVisible(sel) {
        if (!sel) return false;
        const el = document.querySelector(sel);
        if (!el || el.offsetParent === null) return false;
        el.click();
        return true;
      }

      function clickById(id) {
        if (!id) return false;
        const label = document.querySelector('label[for="' + id + '"]');
        if (label && label.offsetParent !== null) {
          label.click();
          return true;
        }
        const node = document.getElementById(id);
        if (node && node.offsetParent !== null) {
          node.click();
          return true;
        }
        return false;
      }

      function clickDateOption(dateNavSel, wanted) {
        if (!wanted) return false;
        wanted = String(wanted).toLowerCase().replace(/_/g, ' ');
        const nav = dateNavSel ? document.querySelector(dateNavSel) : null;
        const root = nav || document;

        const map = [
          ['today', ['today']],
          ['3d', ['last 3 days', '3 days']],
          ['7d', ['last 7 days', '7 days', 'week']],
          ['14d', ['last 14 days', '14 days', 'fortnight']],
          ['30d', ['last 30 days', '30 days', 'month']]
        ];

        let wantedKeywords = [];
        for (const [k, vals] of map) {
          if (wanted.includes(k) || vals.some(v => wanted.includes(v))) {
            wantedKeywords = vals;
            break;
          }
        }
        if (!wantedKeywords.length) return false;

        const candidates = Array.from(root.querySelectorAll('a, button, label, [role="radio"], [role="checkbox"]'));
        for (const el of candidates) {
          const txt = (el.textContent || '').trim().toLowerCase();
          if (!txt) continue;
          if (wantedKeywords.some(k => txt.includes(k)) && el.offsetParent !== null) {
            el.click();
            return true;
          }
        }
        return false;
      }

      function setSalary(fromAttr, toAttr, minVal, maxVal) {
        let changed = false;
        const fromCandidates = [
          fromAttr ? 'input[name="' + fromAttr + '"]' : null,
          'input[name="salaryFieldFrom"]',
          'input[id*="salary"][id*="From"]',
          'input[aria-label*="minimum" i]',
          'input[placeholder*="min" i]'
        ].filter(Boolean);

        const toCandidates = [
          toAttr ? 'input[name="' + toAttr + '"]' : null,
          'input[name="salaryFieldTo"]',
          'input[id*="salary"][id*="To"]',
          'input[aria-label*="maximum" i]',
          'input[placeholder*="max" i]'
        ].filter(Boolean);

        function setFirst(selectors, value) {
          if (!value) return false;
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && 'value' in el && el.offsetParent !== null) {
              el.focus();
              el.value = value;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          }
          return false;
        }

        if (setFirst(fromCandidates, minVal)) changed = true;
        if (setFirst(toCandidates, maxVal)) changed = true;
        return changed;
      }

      const results = {
        workTypeApplied: false,
        remoteApplied: false,
        dateApplied: false,
        salaryApplied: false
      };

      if (config.jobType && config.jobType !== 'any') {
        clickIfVisible(filters.work_type_toggle);
        const id = filters.work_type_ids ? filters.work_type_ids[config.jobType] : null;
        results.workTypeApplied = clickById(id);
      }

      if (config.remotePreference && config.remotePreference !== 'any') {
        clickIfVisible(filters.work_arrangement_toggle);
        const id = filters.work_arrangement_ids ? filters.work_arrangement_ids[config.remotePreference] : null;
        results.remoteApplied = clickById(id);
      }

      if (config.listedDate) {
        clickIfVisible(filters.date_toggle);
        results.dateApplied = clickDateOption(filters.date_nav, config.listedDate);
      }

      if (config.minSalary || config.maxSalary) {
        clickIfVisible(filters.salary_toggle);
        results.salaryApplied = setSalary(
          filters.salary_field_label_from_attr,
          filters.salary_field_label_to_attr,
          config.minSalary,
          config.maxSalary
        );
      }

      return results;
      `,
      filters,
      { jobType, remotePreference, listedDate, minSalary, maxSalary }
    ) as {
      workTypeApplied: boolean;
      remoteApplied: boolean;
      dateApplied: boolean;
      salaryApplied: boolean;
    };

    printLog(`Filters result: workType=${applyResult.workTypeApplied}, remote=${applyResult.remoteApplied}, date=${applyResult.dateApplied}, salary=${applyResult.salaryApplied}`);
    yield 'filters_applied_successfully';
  } catch (error) {
    printLog(`Filter application error: ${error}`);
    yield 'filters_application_failed';
  }
}

// Step 6: Collect Job Cards
export async function* collectJobCards(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const selectors = ctx.selectors?.job_cards || ['article[data-testid="job-card"]'];

  for (const selector of selectors) {
    try {
      const cards = await ctx.driver.findElements(By.css(selector));
      if (cards.length > 0) {
        ctx.job_cards = cards;
        ctx.job_index = 0;
        ctx.total_jobs = cards.length;
        ctx.applied_jobs = 0;

        // Reset retry counter on success
        ctx.retry_counts.collect_cards_retries = 0;
        userLog(`✅ Found ${cards.length} jobs`);
        yield "cards_collected";
        return;
      }
    } catch { continue; }
  }

  ctx.retry_counts.collect_cards_retries = (ctx.retry_counts.collect_cards_retries || 0) + 1;

  if (ctx.retry_counts.collect_cards_retries >= ctx.retry_counts.MAX_COLLECT_CARDS_RETRIES) {
    printLog(`❌ Max collect cards retries (${ctx.retry_counts.MAX_COLLECT_CARDS_RETRIES}) reached. No job cards found.`);
    yield "no_cards_found_permanently";
  } else {
    printLog(`⚠️ No job cards found, retry ${ctx.retry_counts.collect_cards_retries}/${ctx.retry_counts.MAX_COLLECT_CARDS_RETRIES}`);
    await ctx.driver.sleep(2000); // Add delay before retry
    yield "cards_collect_retry";
  }
}

// Step 7: Click Job Card
export async function* clickJobCard(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const index = ctx.job_index || 0;
  const total = ctx.total_jobs || 0;
  const maxJobs = ctx.maxJobsLimit || 0;

  // Stop if we've reached the user-requested extraction limit
  if (maxJobs > 0 && (ctx.jobs_extracted || 0) >= maxJobs) {
    printLog(`✅ Reached extraction limit of ${maxJobs} jobs. Stopping.`);
    yield "max_jobs_reached";
    return;
  }

  if (total === 0 || index >= total) {
    yield "job_cards_finished";
    return;
  }

  try {
    // Dynamically re-fetch the cards to avoid StaleElementReferenceError
    // since the DOM might have changed after closing a Quick Apply modal
    const selectors = ctx.selectors?.job_cards || ['article[data-testid="job-card"]'];
    let currentCard = null;

    for (const selector of selectors) {
      try {
        const freshCards = await ctx.driver.findElements(By.css(selector));
        if (freshCards.length > index) {
          currentCard = freshCards[index];
          break;
        }
      } catch { continue; }
    }

    if (!currentCard) {
      printLog(`⚠️ Could not find job card at index ${index} - DOM might have changed`);
      ctx.job_index = index + 1;
      yield "job_card_skipped";
      return;
    }

    // Log which job card we're opening (snippet from card text)
    const snippet = (await ctx.driver.executeScript(
      "const t = (arguments[0].textContent || '').trim(); return t.length > 70 ? t.substring(0, 70) + '...' : t;",
      currentCard
    )) as string;
    printLog(`\n📌 Opening job card ${index + 1}/${total}: ${snippet || '(no text)'}`);

    await ctx.driver.executeScript("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", currentCard);
    await ctx.driver.sleep(1000); // Give it time to scroll
    await ctx.driver.executeScript("arguments[0].click();", currentCard);
    await ctx.driver.sleep(2000); // Wait for details panel to load
    ctx.job_index = index + 1;
    yield "job_card_clicked";
  } catch (error) {
    printLog(`Error clicking job card: ${error}`);
    ctx.job_index = index + 1;
    yield "job_card_skipped";
  }
}

// Detect Apply Button Type (with retries to handle slow-loading pages)
export async function* detectApplyType(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    let result: { hasQuickApply: boolean; hasRegularApply: boolean; jobTitle?: string; companyName?: string } = {
      hasQuickApply: false,
      hasRegularApply: false,
      jobTitle: '',
      companyName: ''
    };

    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      result = (await ctx.driver.executeScript(`
      const container = document.querySelector('[data-automation="jobDetailsPage"]') || document.body;

      // Snapshot job title/company for logging (before we return apply result)
      const titleEl = container.querySelector('[data-automation="job-detail-title"]') || container.querySelector('h1[data-automation="jobTitle"]') || container.querySelector('h1');
      const companyEl = container.querySelector('[data-automation="advertiser-name"]') || container.querySelector('[data-automation="jobCompany"]');
      const jobTitle = titleEl ? (titleEl.textContent || '').trim() : '';
      const companyName = companyEl ? (companyEl.textContent || '').trim() : '';

      // Look for buttons/links with apply text
      const applyButtons = Array.from(container.querySelectorAll('button, a, [role="button"]')).filter(el => {
        return el.offsetParent !== null && !el.disabled;
      });

      let foundQuickApply = false;
      let foundRegularApply = false;
      const buttonDetails = [];

      for (const button of applyButtons) {
        const text = (button.textContent || '').trim();
        const lowerText = text.toLowerCase();

        buttonDetails.push({
          text: text,
          lowerText: lowerText,
          tagName: button.tagName
        });

        // ONLY Quick Apply if it contains the word "quick"
        if (lowerText.includes('quick') && lowerText.includes('apply')) {
          foundQuickApply = true;
          console.log('✓ QUICK APPLY found:', text);
          break; // Stop at first Quick Apply
        }
        // Regular Apply if it's exactly "Apply" or "Apply Now" but NO "quick"
        else if ((lowerText === 'apply' || lowerText === 'apply now') && !lowerText.includes('quick')) {
          foundRegularApply = true;
          console.log('✓ REGULAR APPLY found:', text);
        }
      }

      console.log('=== APPLY DETECTION DEBUG ===');
      console.log('All button texts:', buttonDetails);
      console.log('Found Quick Apply:', foundQuickApply);
      console.log('Found Regular Apply:', foundRegularApply);
      console.log('============================');

      return { hasQuickApply: foundQuickApply, hasRegularApply: foundRegularApply, jobTitle: jobTitle, companyName: companyName };
    `)) as { hasQuickApply: boolean; hasRegularApply: boolean; jobTitle?: string; companyName?: string };

      if (result.hasQuickApply || result.hasRegularApply) {
        if (attempt > 1) {
          printLog(`Apply detection succeeded on attempt ${attempt}/${maxAttempts}`);
        }
        break;
      }

      if (attempt < maxAttempts) {
        printLog(`Apply button not found yet (attempt ${attempt}/${maxAttempts}). Waiting for page to finish loading...`);
        await ctx.driver.sleep(2000);
      }
    }

    ctx.currentJobTitlePreview = result?.jobTitle || '';
    ctx.currentJobCompanyPreview = result?.companyName || '';
    if (ctx.currentJobTitlePreview || ctx.currentJobCompanyPreview) {
      printLog(`📋 Job: ${ctx.currentJobTitlePreview || '?'} at ${ctx.currentJobCompanyPreview || '?'}`);
    }
    printLog(`Apply detection result: Quick=${result.hasQuickApply}, Regular=${result.hasRegularApply}`);

    if (result.hasQuickApply) {
      ctx.isQuickApply = true;
      printLog("🚀 QUICK APPLY detected - proceeding with application");
      if (ctx.overlay) {
        try {
          await ctx.overlay.updateJobProgress(0, 1, '🚀 Quick Apply Found!', 2);
          await ctx.overlay.addLogEvent(`📋 ${result.jobTitle || 'Job'} at ${result.companyName || '?'}`);
          await ctx.overlay.addLogEvent('✅ Quick Apply button found — clicking…');
        } catch (_e) { /* overlay not critical */ }
      }
      yield "quick_apply_found";
    } else if (result.hasRegularApply) {
      ctx.isQuickApply = false;
      printLog("⏭️ REGULAR APPLY detected - skipping to next job card");
      if (ctx.overlay) {
        try { await ctx.overlay.addLogEvent('⚠️ Only regular Apply found (no Quick Apply). Skipping.'); } catch (_e) { }
      }
      yield "regular_apply_found";
    } else {
      ctx.isQuickApply = false;
      printLog("❌ NO APPLY BUTTON detected - skipping to next job card");
      if (ctx.overlay) {
        try { await ctx.overlay.addLogEvent('❌ No apply button found on this page.'); } catch (_e) { }
      }
      yield "no_apply_found";
    }
  } catch (error) {
    printLog(`Apply detection error: ${error}`);
    yield "detect_apply_failed";
  }
}

// Parse Job Details
export async function* parseJobDetails(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    const jobData = await ctx.driver.executeScript(`
      // Extract job content with improved Seek structure handling
      function extractJobContent() {
        const container = document.querySelector('[data-automation="jobDetailsPage"]');
        if (!container) return null;

        // Try to extract title using specific selectors first
        let titleText = '';
        const titleSelectors = [
          '[data-automation="job-detail-title"]',
          'h1[data-automation="jobTitle"]',
          'h1',
          '.job-title'
        ];

        for (const selector of titleSelectors) {
          const titleEl = container.querySelector(selector);
          if (titleEl && titleEl.textContent.trim()) {
            titleText = titleEl.textContent.trim();
            break;
          }
        }

        // Try to extract company using specific selectors
        let companyText = '';
        const companySelectors = [
          '[data-automation="advertiser-name"]',
          '[data-automation="jobCompany"]',
          '.advertiser-name'
        ];

        for (const selector of companySelectors) {
          const companyEl = container.querySelector(selector);
          if (companyEl && companyEl.textContent.trim()) {
            companyText = companyEl.textContent.trim();
            break;
          }
        }

        // Extract job header section (title, company, location, etc.)
        let headerText = '';
        const headerEl = container.querySelector('[data-automation="jobHeader"]') ||
                        container.querySelector('.job-header') ||
                        container.querySelector('header');

        if (headerEl) {
          headerText = headerEl.textContent.trim();
        } else {
          // Fallback: construct header from individual elements
          const locationEl = container.querySelector('[data-automation="job-detail-location"]');
          const workTypeEl = container.querySelector('[data-automation="job-detail-work-type"]');
          const salaryEl = container.querySelector('[data-automation="job-detail-salary"]');

          headerText = [titleText, companyText,
                       locationEl?.textContent?.trim(),
                       workTypeEl?.textContent?.trim(),
                       salaryEl?.textContent?.trim()].filter(Boolean).join('\\n');
        }

        // Extract full content using DOM walker for details
        const texts = [];
        const detailsContainer = container.querySelector('[data-automation="jobAdDetails"]');
        const walker = document.createTreeWalker(
          detailsContainer || container,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: function(node) {
              let parent = node.parentElement;
              while (parent && parent !== container) {
                const tagName = parent.tagName.toLowerCase();
                const style = window.getComputedStyle(parent);

                if (tagName === 'style' || tagName === 'script' || tagName === 'noscript' ||
                    style.display === 'none' || style.visibility === 'hidden') {
                  return NodeFilter.FILTER_REJECT;
                }
                parent = parent.parentElement;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
          },
          false
        );

        while (walker.nextNode()) {
          const text = walker.currentNode.textContent.trim();
          if (text !== '') texts.push(text);
        }

        const allText = [...new Set(texts)].join('\\n');

        const unwantedLines = [
          'View all jobs', 'Quick apply', 'Apply', 'Save', 'Report this job advert',
          'Be careful', "Don\'t provide your bank or credit card details when applying for jobs.",
          'Learn how to protect yourself', 'Report this job ad', 'Career Advice'
        ];

        const ratingPatterns = [/^\\d+\\.\\d+$/, /^\\d+\\s+reviews?$/, /^·$/];

        let cleanedLines = allText.split('\\n').filter(line => {
          const trimmed = line.trim();
          if (trimmed === '' || unwantedLines.includes(trimmed)) return false;
          return !ratingPatterns.some(pattern => pattern.test(trimmed));
        });

        const cleanedText = cleanedLines.join('\\n');

        return {
          raw_title: headerText || titleText,
          details: cleanedText,
          extracted_title: titleText,
          extracted_company: companyText
        };
      }

      // Parse job title with structured fields
      function parseJobTitle(titleText) {
        const lines = titleText ? titleText.split('\\n').map(l => l.trim()).filter(l => l) : [];

        const parsed = {
          title: '', company: '', location: '', work_type: '', category: '',
          salary_note: '', posted: '', application_volume: ''
        };

        if (!lines.length) return parsed;

        parsed.title = lines[0];
        if (lines.length >= 2) parsed.company = lines[1];

        let postedIndex = -1;
        for (let i = 2; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes('posted') || lines[i].includes('ago')) {
            postedIndex = i;
            parsed.posted = lines[i].replace(/posted\\s+/i, '');
            break;
          }
        }

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes('application volume')) {
            parsed.application_volume = lines[i];
            break;
          }
        }

        const structuredEndIndex = postedIndex > 0 ? postedIndex : lines.length;
        const structuredData = lines.slice(2, structuredEndIndex).filter(line => {
          return !/^\\d+\\.\\d+$/.test(line) && !/^\\d+\\s+reviews?$/.test(line) && line !== '·';
        });

        if (structuredData.length >= 1) parsed.location = structuredData[0];
        if (structuredData.length >= 2) parsed.work_type = structuredData[1];
        if (structuredData.length >= 3) parsed.category = structuredData[2];

        for (const item of structuredData) {
          if (item.includes('$') && !parsed.salary_note) {
            parsed.salary_note = item;
            break;
          }
        }

        return parsed;
      }

      const extracted = extractJobContent();
      if (!extracted) return null;

      const parsedTitle = parseJobTitle(extracted.raw_title);

      // Extract job ID from URL
      const jobId = new URL(window.location.href).searchParams.get('jobId') || '';

      // Use directly extracted values if parsing failed
      const finalData = {
        ...parsedTitle,
        details: extracted.details,
        raw_title: extracted.raw_title,
        url: window.location.href,
        jobId: jobId,
        scrapedAt: new Date().toISOString(),
        debug: {
          title_length: extracted.raw_title ? extracted.raw_title.length : 0,
          details_length: extracted.details ? extracted.details.length : 0,
          extracted_title: extracted.extracted_title,
          extracted_company: extracted.extracted_company
        }
      };

      // Override with directly extracted values if available and parsed values are empty
      if (!finalData.title && extracted.extracted_title) {
        finalData.title = extracted.extracted_title;
      }
      if (!finalData.company && extracted.extracted_company) {
        finalData.company = extracted.extracted_company;
      }

      return finalData;
    `);

    if (jobData) {
      // Clean location and extract workplace type if needed
      const { cleanedLocation, workplaceType } = cleanLocation(jobData.location || '');
      jobData.location = cleanedLocation;
      if (workplaceType && !jobData.workMode) {
        jobData.workMode = workplaceType;
      }
      
      // Parse HR contact, required skills, required experience from details text (for Job Analytics)
      const parsed = parseJobDetailsFromText(jobData.details || '');
      if (parsed.hrContact && (parsed.hrContact.name || parsed.hrContact.email || parsed.hrContact.phone)) {
        jobData.hrContact = parsed.hrContact;
      }
      if (parsed.requiredSkills && parsed.requiredSkills.length > 0) {
        jobData.requiredSkills = parsed.requiredSkills;
      }
      if (parsed.requiredExperience) {
        jobData.requiredExperience = parsed.requiredExperience;
      }

      // Mark as internal (Quick Apply via Seek)
      jobData.applicationType = 'internal';

      // Store in context so every step can log "which job"
      ctx.currentJobTitle = jobData.title || '';
      ctx.currentJobCompany = jobData.company || '';

      const jobId = jobData.jobId || Date.now().toString();
      const jobDir = getJobArtifactDir(ctx, 'seek', jobId);
      const filepath = path.join(jobDir, 'job_details.json');
      const clientEmail = getClientEmailFromContext(ctx);
      if (clientEmail) {
        jobData.clientEmail = clientEmail;
      }

      fs.writeFileSync(filepath, JSON.stringify(jobData, null, 2));

      // Store current job file path in context for employer questions step
      ctx.currentJobFile = filepath;
      ctx.currentJobDir = jobDir;

      printLog(`Quick Apply job saved: ${jobData.title} at ${jobData.company} (${filepath})`);

      // Increment extracted jobs counter
      ctx.jobs_extracted = (ctx.jobs_extracted || 0) + 1;
      ctx.jobs_internal = (ctx.jobs_internal || 0) + 1;

      // Update overlay progress and log
      if (ctx.overlay) {
        const maxJobs = ctx.maxJobsLimit || 0;
        const displayTotal = maxJobs > 0 ? maxJobs : (ctx.total_jobs || 0);
        const countMsg = maxJobs > 0
          ? `> ${ctx.jobs_extracted}/${maxJobs} jobs extracted`
          : `> ${ctx.jobs_extracted} jobs extracted`;

        await ctx.overlay.addLogEvent(countMsg);
        await ctx.overlay.addLogEvent(`  📋 ${ctx.currentJobTitle || 'Unknown Title'} (internal)`);
        await ctx.overlay.addLogEvent(`  🏢 ${ctx.currentJobCompany || 'Unknown Company'}`);
        if (jobData.url) {
          await ctx.overlay.addLogEvent(`  🔗 ${jobData.url}`);
        }
        await ctx.overlay.updateJobProgress(
          ctx.jobs_extracted,
          displayTotal,
          `Internal job extracted: ${ctx.currentJobTitle}`,
          9,
          ctx.jobs_internal,
          ctx.jobs_external || 0
        );
      }
    } else {
      printLog("Quick Apply job found but failed to extract data");
    }

    yield "job_parsed";
  } catch (error) {
    printLog(`Job parsing error: ${error}`);
    yield "parse_failed";
  }
}

// Parse External Job Details (regular/external apply jobs)
export async function* parseExternalJobDetails(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    // Extract job info directly from the currently-visible job card panel on the seek results page
    const jobData = await ctx.driver.executeScript(`
      try {
        const g = (sel) => document.querySelector(sel);
        const t = (el) => el ? el.textContent.trim() : null;

        const titleEl  = g('[data-automation="job-detail-title"]') || g('h1[class*="jobTitle"]') || g('[class*="job-title"]');
        const companyEl= g('[data-automation="advertiser-name"]')  || g('[class*="companyName"]');
        const locationEl=g('[data-automation="job-detail-location"]') || g('[data-automation="location"]') || g('[class*="location"]');
        const salaryEl  = g('[data-automation="job-detail-salary"]')  || g('[class*="salary"]');
        const workTypeEl= g('[data-automation="job-detail-work-type"]') || g('[data-automation="worktype"]');
        const classEl   = g('[data-automation="job-detail-classifications"]') || g('[data-automation="classification"]');

        // Listed date
        const listedEl  = g('[data-automation="job-detail-date"]') || g('[class*="listed-date"]');

        // Closing date / expiry
        const closeEl   = g('[data-automation="listing-closing-date"]') || g('[class*="closingDate"]');

        // Full description text — try multiple selectors Seek uses across different page layouts
        const descEl = g('[data-automation="jobAdDetails"]')
          || g('[data-automation="jobDescription"]')
          || g('[data-automation="job-detail-description"]')
          || g('[class*="jobDescription"]')
          || g('[class*="job-description"]')
          || g('[class*="_description_"]');

        // Fallback: grab all text inside the detail panel and strip metadata lines
        let descText = null;
        if (descEl) {
          descText = (descEl.innerText || descEl.textContent || '').trim();
        } else {
          const panel = g('[data-automation="jobDetailsPage"]') || g('[class*="jobDetail"]') || g('[class*="job-detail"]');
          if (panel) {
            const full = (panel.innerText || panel.textContent || '').trim();
            // Strip title + company from the top then take the rest as description
            const lines = full.split('\\n').map(l => l.trim()).filter(Boolean);
            const startIdx = lines.findIndex((l, i) => i > 2 && l.length > 60);
            descText = startIdx > 0 ? lines.slice(startIdx).join('\\n') : full;
          }
        }

        // Apply link (external)
        const applyEl   = g('[data-automation="job-detail-apply"]') || g('[data-automation="apply-button"]') || g('a[href*="apply"]');

        // Job ID from URL
        const jobId = new URL(window.location.href).searchParams.get('jobId') || '';
        const url   = window.location.href;

        // Advertiser link / company page
        const advertiserLinkEl = g('[data-automation="advertiser-name"] a') || g('a[class*="company"]');
        const companyUrl = advertiserLinkEl ? advertiserLinkEl.href : null;

        return {
          title:          t(titleEl),
          company:        t(companyEl),
          location:       t(locationEl),
          salary:         t(salaryEl),
          workType:       t(workTypeEl),
          classification: t(classEl),
          listedDate:     t(listedEl),
          closingDate:    t(closeEl),
          description:    descText,
          externalApplyUrl: applyEl ? applyEl.href : null,
          companyUrl,
          url,
          jobId,
          scrapedAt: new Date().toISOString(),
          applicationType: 'external'
        };
      } catch(e) {
        return null;
      }
    `) as any;

    if (jobData && jobData.title) {
      // Clean location and extract workplace type if needed
      const { cleanedLocation, workplaceType } = cleanLocation(jobData.location || '');
      jobData.location = cleanedLocation;
      if (workplaceType && !jobData.workMode) {
        jobData.workMode = workplaceType;
      }

      const clientEmail = getClientEmailFromContext(ctx);
      if (clientEmail) jobData.clientEmail = clientEmail;

      ctx.currentJobTitle = jobData.title || '';
      ctx.currentJobCompany = jobData.company || '';

      const jobId = jobData.jobId || `ext_${Date.now()}`;
      const jobDir = getJobArtifactDir(ctx, 'seek', jobId);
      const filepath = path.join(jobDir, 'job_details.json');
      fs.writeFileSync(filepath, JSON.stringify(jobData, null, 2));
      ctx.currentJobFile = filepath;
      ctx.currentJobDir = jobDir;

      printLog(`External job saved: ${jobData.title} at ${jobData.company}`);

      // Increment extracted jobs counter (counts both internal and external)
      ctx.jobs_extracted = (ctx.jobs_extracted || 0) + 1;
      ctx.jobs_external = (ctx.jobs_external || 0) + 1;

      if (ctx.overlay) {
        const maxJobs = ctx.maxJobsLimit || 0;
        const displayTotal = maxJobs > 0 ? maxJobs : (ctx.total_jobs || 0);
        const countMsg = maxJobs > 0
          ? `> ${ctx.jobs_extracted}/${maxJobs} jobs extracted`
          : `> ${ctx.jobs_extracted} jobs extracted`;
        await ctx.overlay.addLogEvent(countMsg);
        await ctx.overlay.addLogEvent(`  🌐 ${ctx.currentJobTitle || 'Unknown Title'} (external)`);
        await ctx.overlay.addLogEvent(`  🏢 ${ctx.currentJobCompany || 'Unknown Company'}`);
        if (jobData.url) await ctx.overlay.addLogEvent(`  🔗 ${jobData.url}`);
        await ctx.overlay.updateJobProgress(
          ctx.jobs_extracted,
          displayTotal,
          `External job extracted: ${ctx.currentJobTitle}`,
          8,
          ctx.jobs_internal || 0,
          ctx.jobs_external
        );
      }

      yield "external_job_parsed";
    } else {
      userLog(`⚠️ Skipped — could not extract job details from panel`);
      yield "parse_failed";
    }
  } catch (error) {
    printLog(`External job parsing error: ${error}`);
    yield "parse_failed";
  }
}

// Save successfully parsed job to external Database, then skip
export async function* saveScrapedJob(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    printLog(`Saving scraped job to Database...`);

    if (!ctx.currentJobFile || !fs.existsSync(ctx.currentJobFile)) {
      throw new Error("No job details file found to save.");
    }

    const jobData = JSON.parse(fs.readFileSync(ctx.currentJobFile, 'utf8'));

    // Extract platform job ID from URL
    const explicitUrlMatch = jobData.url?.match(/job\/(\d+)/);
    const platformJobId = explicitUrlMatch ? explicitUrlMatch[1] : (jobData.jobId || Date.now().toString());
    const jobUrl = jobData.url || (platformJobId ? `https://www.seek.com.au/job/${platformJobId}` : undefined);

    const payload = {
      platform: 'seek',
      platformJobId: platformJobId,
      title: jobData.title || ctx.currentJobTitle || 'Unknown Job Title',
      company: jobData.company || ctx.currentJobCompany || 'Unknown Company',
      url: jobUrl,
      location: jobData.location,
      // description: internal jobs store as 'details', external as 'description'
      description: jobData.description || jobData.details || undefined,
      salary: jobData.salary || jobData.salary_note || undefined,
      workMode: jobData.workType || jobData.work_type || jobData.workMode || undefined,
      jobType: jobData.jobType || jobData.classification || jobData.category || undefined,
      postedDate: jobData.listedDate || jobData.posted_date || jobData.postedDate || undefined,
      closingDate: jobData.closingDate || jobData.closing_date || undefined,
      rawData: jobData   // keep original for reference; includes applicationType
    };

    try {
      // Primary path: API client with JWT/session conversion
      const result = await apiRequest('/api/scraped-jobs', 'POST', payload);
      if (result?.success) {
        userLog(`📋 ${payload.title} — ${payload.company} ✅ Saved`);
        printLog(`DB id: ${result.id || 'new'}`);
      } else {
        printLog(`⚠️ DB save returned unexpected response: ${JSON.stringify(result)}`);
      }
    } catch (apiErr) {
      printLog(`⚠️ Failed to save via apiRequest: ${apiErr}`);

      // Fallback path for environments where JWT conversion fails.
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

        const resp = await fetch(`${baseUrl}/api/scraped-jobs`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });

        if (resp.ok) {
          userLog(`📋 ${payload.title} — ${payload.company} ✅ Saved`);
          printLog(`Saved via fallback path`);
        } else {
          const txt = await resp.text().catch(() => '');
          printLog(`⚠️ Fallback DB save failed (${resp.status}): ${txt}`);
        }
      } catch (fallbackErr) {
        printLog(`⚠️ Fallback DB save error: ${fallbackErr}`);
      }
    }

    if (ctx.isQuickApply) {
      yield "job_saved_quick_apply";
    } else {
      yield "job_saved";
    }
  } catch (error) {
    printLog(`Error saving scraped job: ${error}`);
    yield "save_failed";
  }
}

// Click Quick Apply Button
export async function* clickQuickApply(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    logCurrentJob(ctx);
    printLog("Clicking Quick Apply button...");

    const clicked = await ctx.driver.executeScript(`
      const container = document.querySelector('[data-automation="jobDetailsPage"]') || document.body;

      // Try multiple selectors for Quick Apply button
      const quickApplySelectors = [
        '[data-automation="job-detail-apply"]',
        'button',
        'a'
      ];

      for (const selector of quickApplySelectors) {
        const elements = Array.from(container.querySelectorAll(selector));

        for (const element of elements) {
          const text = (element.textContent || '').toLowerCase();

          if (text.includes('quick apply') ||
              (text.includes('apply') && !text.includes('applied'))) {

            if (element.offsetParent !== null && !element.disabled) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });

              // Small delay before clicking
              setTimeout(() => {
                element.click();
                console.log('Quick Apply button clicked successfully');
              }, 500);

              return true;
            }
          }
        }
      }

      console.log('Quick Apply button not found or not clickable');
      return false;
    `);

    if (clicked) {
      // Wait for potential new tab/window to open
      await ctx.driver.sleep(2000);

      // Check if a new window/tab opened
      const handles = await ctx.driver.getAllWindowHandles();
      if (handles.length > 1) {
        // Switch to the new tab (last one opened)
        await ctx.driver.switchTo().window(handles[handles.length - 1]);
        printLog("Switched to Quick Apply tab");
      }

      printLog("Quick Apply button clicked successfully");
      yield "quick_apply_clicked";
    } else {
      printLog("Quick Apply button not found or not clickable");
      yield "quick_apply_failed";
    }

  } catch (error) {
    printLog(`Error clicking Quick Apply: ${error}`);
    yield "quick_apply_failed";
  }
}

// Wait for Quick Apply Page to Load
export async function* waitForQuickApplyPage(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    printLog("Waiting for Quick Apply page to load...");

    // Wait for page navigation and new elements to appear
    await ctx.driver.sleep(3000);

    // Check current URL to see if we're on a Quick Apply page
    const currentUrl = await ctx.driver.getCurrentUrl();
    printLog(`Current URL: ${currentUrl}`);

    // Try multiple checks with retries
    let pageReady = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      pageReady = await ctx.driver.executeScript(`
        // Check multiple indicators for Quick Apply page
        const progressBar = document.querySelector('nav[aria-label="Progress bar"]');
        const resumeSelect = document.querySelector('select[data-testid="select-input"]');
        const continueBtn = document.querySelector('button[data-testid="continue-button"]');
        const seekLogo = document.querySelector('[data-testid="seek-logo"]');
        const formElements = document.querySelectorAll('form, fieldset');

        // Check if URL contains Quick Apply indicators
        const urlHasQuickApply = window.location.href.includes('quick-apply') ||
                                 window.location.href.includes('apply') ||
                                 window.location.pathname.includes('/apply');

        const hasQuickApplyElements = !!(progressBar || resumeSelect || continueBtn);
        const hasFormElements = formElements.length > 0;
        const hasSeekBranding = !!seekLogo;

        console.log('Page check attempt ${attempt + 1}:', {
          progressBar: !!progressBar,
          resumeSelect: !!resumeSelect,
          continueBtn: !!continueBtn,
          urlHasQuickApply,
          hasFormElements,
          hasSeekBranding
        });

        return hasQuickApplyElements || (urlHasQuickApply && (hasFormElements || hasSeekBranding));
      `);

      if (pageReady) break;

      if (attempt < 2) {
        printLog(`Page not ready, attempt ${attempt + 1}/3, waiting...`);
        await ctx.driver.sleep(2000);
      }
    }

    if (pageReady) {
      printLog("Quick Apply page loaded successfully");
      yield "quick_apply_page_ready";
    } else {
      printLog("Quick Apply page not ready after retries");
      yield "page_load_timeout";
    }

  } catch (error) {
    printLog(`Quick Apply page load error: ${error}`);
    yield "page_load_timeout";
  }
}

// Get Current Step in Quick Apply Flow
export async function* getCurrentStep(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    logCurrentJob(ctx);
    const currentStep = await ctx.driver.executeScript(`
      const nav = document.querySelector('nav[aria-label="Progress bar"]');
      if (!nav) return 'progress_bar_not_found';

      const currentStepBtn = nav.querySelector('li button[aria-current="step"]');
      if (!currentStepBtn) return 'progress_bar_not_found';

      const stepText = currentStepBtn.querySelector('span:nth-child(2) span:nth-child(2) span span')?.textContent?.trim() || '';
      return stepText;
    `);

    printLog(`Current Quick Apply step: ${currentStep}`);

    if (currentStep === 'progress_bar_not_found') {
      yield "progress_bar_not_found";
    } else if (currentStep === "Choose documents") {
      yield "current_step_choose_documents";
    } else if (currentStep === "Answer employer questions") {
      yield "current_step_employer_questions";
    } else if (currentStep === "Update SEEK Profile") {
      yield "current_step_update_profile";
    } else if (currentStep === "Review and submit") {
      yield "current_step_review_submit";
    } else {
      printLog(`Unknown step: ${currentStep}`);
      yield "current_step_unknown";
    }

  } catch (error) {
    printLog(`Error getting current step: ${error}`);
    yield "progress_bar_evaluation_error";
  }
}




// Check for Submit Button
export async function* checkForSubmitButton(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    logCurrentJob(ctx);
    printLog("Checking for submit button...");
    
    // Initialize continue click counter if not exists
    if (!ctx.continueClickCount) {
      ctx.continueClickCount = 0;
    }
    
    // Safety limit: don't click continue more than 10 times
    const MAX_CONTINUE_CLICKS = 10;
    if (ctx.continueClickCount >= MAX_CONTINUE_CLICKS) {
      printLog(`⚠️ Reached maximum continue clicks (${MAX_CONTINUE_CLICKS}), proceeding to submit check`);
      yield "max_continue_reached";
      return;
    }

    // Check if submit button exists
    const submitCheck = await ctx.driver.executeScript(`
      const submitCandidates = [
        'button[data-automation="submitButton"]',
        'button[type="submit"]',
        '[data-testid="review-submit-button"]',
        '[data-automation="reviewSubmitButton"]'
      ];

      const isVisible = (el) => !!el && el.offsetParent !== null;
      
      for (const sel of submitCandidates) {
        const el = document.querySelector(sel);
        if (el && isVisible(el) && !el.disabled) {
          return { found: true, selector: sel };
        }
      }

      const buttons = Array.from(document.querySelectorAll('button'));
      const textButton = buttons.find((b) => {
        const t = (b.textContent || '').trim().toLowerCase();
        return isVisible(b) && !b.disabled && (t.includes('submit application') || t === 'submit');
      });
      
      if (textButton) {
        return { found: true, selector: 'button:text-match' };
      }

      return { found: false, selector: '' };
    `) as { found: boolean; selector: string };

    if (submitCheck.found) {
      printLog(`✅ Submit button found: ${submitCheck.selector}`);
      yield "submit_button_found";
    } else {
      printLog(`⚠️ Submit button not found (continue clicks: ${ctx.continueClickCount}/${MAX_CONTINUE_CLICKS})`);
      yield "submit_button_not_found";
    }
  } catch (error) {
    printLog(`Error checking for submit button: ${error}`);
    yield "submit_button_not_found";
  }
}

// Click Continue Button
export async function* clickContinueButton(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    logCurrentJob(ctx);
    printLog("Clicking continue button...");

    // First, check the form state before clicking continue
    const formState = await ctx.driver.executeScript(`
      // Check cover letter state
      const textarea = document.querySelector('textarea[data-testid="coverLetterTextInput"]');
      const coverLetterValue = textarea ? textarea.value : 'NOT_FOUND';
      const coverLetterLength = textarea ? textarea.value.length : 0;

      // Check for any validation errors
      const errorElements = document.querySelectorAll('[role="alert"], .error, .invalid, [aria-invalid="true"]');
      const hasErrors = errorElements.length > 0;
      const errorMessages = Array.from(errorElements).map(el => el.textContent.trim()).filter(txt => txt);

      // Check if continue button is enabled
      const continueBtn = document.querySelector('button[data-testid="continue-button"]');
      const btnEnabled = continueBtn ? !continueBtn.disabled : false;

      return {
        coverLetterLength: coverLetterLength,
        coverLetterPreview: coverLetterValue.substring(0, 50),
        hasErrors: hasErrors,
        errorMessages: errorMessages,
        continueButtonEnabled: btnEnabled
      };
    `);

    printLog(`📋 FORM STATE CHECK: Cover letter length: ${formState.coverLetterLength}, Errors: ${formState.hasErrors}, Continue enabled: ${formState.continueButtonEnabled}`);
    if (formState.hasErrors) {
      printLog(`🔥 VALIDATION ERRORS: ${formState.errorMessages.join(', ')}`);
    }

    const continueClicked = await ctx.driver.executeScript(`
      const continueSelectors = [
        'button[data-testid="continue-button"]',
        'button:contains("Continue")',
        'button:contains("Next")'
      ];

      for (const selector of continueSelectors) {
        let button;
        if (selector.includes(':contains')) {
          const text = selector.match(/contains\\(\"([^\"]+)\"\\)/)[1];
          const buttons = Array.from(document.querySelectorAll('button')).filter(btn =>
            btn.textContent.toLowerCase().includes(text.toLowerCase())
          );
          button = buttons.find(btn => btn.offsetParent !== null && !btn.disabled);
        } else {
          button = document.querySelector(selector);
        }

        if (button && button.offsetParent !== null && !button.disabled) {
          button.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => {
            button.click();
            console.log('Continue button clicked');
          }, 300);
          return true;
        }
      }

      return false;
    `);

    if (continueClicked) {
      // Increment continue click counter
      if (!ctx.continueClickCount) {
        ctx.continueClickCount = 0;
      }
      ctx.continueClickCount++;
      printLog(`✅ Continue button clicked successfully (count: ${ctx.continueClickCount})`);
      await ctx.driver.sleep(3000); // Wait longer for navigation/page change
      yield "continue_clicked";
    } else {
      printLog("⚠️ Continue button not found - may have reached final step");
      yield "continue_button_not_found";
    }

  } catch (error) {
    printLog(`Continue button error: ${error}`);
    yield "continue_button_error";
  }
}

// Helper function to check if driver session is valid
async function isDriverSessionValid(driver: WebDriver): Promise<boolean> {
  try {
    await driver.getCurrentUrl();
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('session') || errorMsg.includes('session ID') || errorMsg.includes('quit')) {
      return false;
    }
    // Other errors might be transient, assume valid
    return true;
  }
}

/**
 * Recreate driver instance and restore context when session is invalid
 * This allows the bot to continue working even if the browser session is lost
 */
async function recreateDriverAndRestoreContext(ctx: WorkflowContext): Promise<boolean> {
  try {
    printLog("🔄 Driver session invalid - recreating driver instance...");
    
    // Save current URL if possible (before old driver is gone)
    let currentUrl: string | null = null;
    try {
      if (ctx.driver) {
        currentUrl = await ctx.driver.getCurrentUrl();
        printLog(`📍 Current URL: ${currentUrl}`);
      }
    } catch (e) {
      printLog("⚠️ Could not get current URL from old driver");
    }

    // Clean up old driver if it exists
    try {
      if (ctx.driver) {
        // Try to quit gracefully, but don't wait if it's already dead
        try {
          await ctx.driver.quit().catch(() => {});
        } catch (e) {
          // Driver already dead, that's ok
        }
      }
    } catch (e) {
      // Old driver is already invalid, that's expected
    }

    // Create new driver instance
    printLog("🔧 Setting up new Chrome driver...");
    const { driver: newDriver, sessionExists, sessionsDir } = await setupChromeDriver('seek');
    
    // Restore context properties
    ctx.driver = newDriver;
    ctx.sessionExists = sessionExists;
    ctx.sessionsDir = sessionsDir;
    
    // Reinitialize context objects
    if (!ctx.humanBehavior) {
      ctx.humanBehavior = new HumanBehavior(DEFAULT_HUMANIZATION);
    }
    ctx.sessionManager = new UniversalSessionManager(newDriver, SessionConfigs.seek);
    ctx.overlay = new UniversalOverlay(newDriver, 'Seek');

    // Apply stealth features
    await StealthFeatures.hideWebDriver(newDriver);
    await StealthFeatures.randomizeUserAgent(newDriver);

    // Re-register recovery callback on new driver
    (newDriver as any).__recoverDriver = async () => {
      return await recreateDriverAndRestoreContext(ctx);
    };

    // Show overlay immediately on recovered driver
    await ctx.overlay.initialize();
    await ctx.overlay.showJobProgress(0, 0, 'Reconnected — resuming...', 0);

    // Clear stale overlay state
    try {
      await newDriver.executeScript(`
        sessionStorage.removeItem('universal_overlay_state');
        window.__overlaySystemInitialized = false;
      `);
    } catch (e) {
      // Page not loaded yet, that's ok
    }

    // Navigate to saved URL or homepage
    if (currentUrl && currentUrl.startsWith('http')) {
      printLog(`🌐 Navigating to saved URL: ${currentUrl}`);
      try {
        await newDriver.get(currentUrl);
        await newDriver.sleep(3000);
        printLog("✅ Successfully navigated to saved URL");
      } catch (navError) {
        printLog(`⚠️ Could not navigate to saved URL, going to homepage: ${navError}`);
        await newDriver.get(ctx.seek_url || `${BASE_URL}/jobs`);
        await newDriver.sleep(3000);
      }
    } else {
      printLog(`🌐 Navigating to homepage: ${ctx.seek_url || `${BASE_URL}/jobs`}`);
      await newDriver.get(ctx.seek_url || `${BASE_URL}/jobs`);
      await newDriver.sleep(3000);
    }

    printLog("✅ Driver recreated and context restored successfully");
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    printLog(`❌ Failed to recreate driver: ${errorMsg}`);
    return false;
  }
}

// Close Quick Apply and Continue Search
export async function* closeQuickApplyAndContinueSearch(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    // Note: Application is already recorded with status "applied" in submitApplication step
    // This function just handles closing the Quick Apply tab and keeping browser open

    printLog("Closing Quick Apply page...");

    // Temporarily disable browser monitoring to prevent false shutdowns during window operations
    try {
      const disableMonitoring = (ctx.driver as any).__disableBrowserMonitoring;
      if (typeof disableMonitoring === 'function') {
        disableMonitoring();
      } else {
        printLog("⚠️ Browser monitoring disable function not available (continuing anyway)");
      }
    } catch (e) {
      // Monitor functions might not exist, that's ok - continue anyway
      printLog(`⚠️ Could not disable browser monitoring: ${e}`);
    }

    // Validate driver session before proceeding
    const driverValid = await isDriverSessionValid(ctx.driver);
    if (!driverValid) {
      printLog(`❌ Driver session is invalid - attempting to recreate driver...`);
      const recreated = await recreateDriverAndRestoreContext(ctx);
      if (!recreated) {
        printLog("❌ Failed to recreate driver - cannot continue");
        yield "hunting_next_job"; // Continue workflow but skip window operations
        return;
      }
      printLog("✅ Driver recreated successfully - continuing with workflow");
      yield "hunting_next_job"; // Continue workflow with new driver
      return;
    }

    try {
    const handles = await ctx.driver.getAllWindowHandles();
    printLog(`Found ${handles.length} window handles`);

      // CRITICAL: Never close if there's only one window - it will close the entire browser session
    if (handles.length > 1) {
        // Get current window handle before closing
        const currentHandle = await ctx.driver.getWindowHandle();
        printLog(`Current window handle: ${currentHandle}`);
        
        // Find the main window handle (not the current one)
        const mainHandle = handles.find((h: string) => h !== currentHandle) || handles[0];
        printLog(`Main window handle: ${mainHandle}`);

        // CRITICAL: Switch to main window FIRST to ensure we're not on the tab we're about to close
        // This prevents closing the last window which would invalidate the driver session
        try {
          await ctx.driver.switchTo().window(mainHandle);
          await ctx.driver.sleep(500);
          printLog("✅ Switched to main window before closing Quick Apply tab");
          
          // Verify we successfully switched by checking current handle
          const verifyHandle = await ctx.driver.getWindowHandle();
          if (verifyHandle !== mainHandle) {
            printLog("⚠️ Warning: Window switch verification failed, aborting tab close");
            yield "hunting_next_job";
            return;
          }
        } catch (switchError) {
          const errorMsg = switchError instanceof Error ? switchError.message : String(switchError);
          printLog(`❌ Could not switch to main window: ${errorMsg}`);
          printLog("⚠️ Aborting tab close to prevent session invalidation");
          yield "hunting_next_job";
          return;
        }

        // Now close the Quick Apply tab (which should be the previous current window)
        // We're now safely on the main window, so closing the other tab won't invalidate the session
        try {
          // Verify the handle still exists before trying to switch
          const currentHandles = await ctx.driver.getAllWindowHandles();
          if (currentHandles.length <= 1) {
            printLog("⚠️ Only one window remaining - cannot close (would invalidate session)");
            yield "hunting_next_job";
            return;
          }

          if (currentHandles.includes(currentHandle)) {
            // CRITICAL: Double-check we have more than one window before closing
            if (currentHandles.length <= 1) {
              printLog("⚠️ CRITICAL: Only one window - aborting close to prevent session invalidation");
              yield "hunting_next_job";
              return;
            }

            // Verify session is still valid before closing
            if (!(await isDriverSessionValid(ctx.driver))) {
              printLog("❌ Driver session invalid before closing tab - attempting recovery...");
              const recreated = await recreateDriverAndRestoreContext(ctx);
              if (!recreated) {
                printLog("❌ Failed to recreate driver - cannot continue");
                yield "hunting_next_job";
                return;
              }
              printLog("✅ Driver recreated - continuing");
              yield "hunting_next_job";
              return;
            }

            await ctx.driver.switchTo().window(currentHandle);
      await ctx.driver.close();
            printLog("✅ Closed Quick Apply tab");
            
            // Immediately switch back to main window to ensure we're on a valid window
            await ctx.driver.sleep(200);
            
            // Verify session is still valid after closing
            if (!(await isDriverSessionValid(ctx.driver))) {
              printLog("❌ CRITICAL: Driver session was invalidated after closing tab - attempting recovery...");
              const recreated = await recreateDriverAndRestoreContext(ctx);
              if (!recreated) {
                printLog("❌ Failed to recreate driver - cannot continue");
                yield "hunting_next_job";
                return;
              }
              printLog("✅ Driver recreated - continuing");
              yield "hunting_next_job";
              return;
            }

            const remainingHandles = await ctx.driver.getAllWindowHandles();
            if (remainingHandles.length > 0 && remainingHandles.includes(mainHandle)) {
              await ctx.driver.switchTo().window(mainHandle);
            } else if (remainingHandles.length > 0) {
              await ctx.driver.switchTo().window(remainingHandles[0]);
            } else {
              printLog("❌ CRITICAL: No windows remaining after closing tab!");
              yield "hunting_next_job";
              return;
            }
          } else {
            printLog("Quick Apply tab already closed");
          }
        } catch (closeError) {
          const errorMsg = closeError instanceof Error ? closeError.message : String(closeError);
          // Check if it's a "no such window" error (tab already closed) - that's ok
          if (errorMsg.includes('no such window') || errorMsg.includes('target window already closed')) {
            printLog("Quick Apply tab was already closed");
          } else if (errorMsg.includes('session') || errorMsg.includes('session ID')) {
            printLog(`❌ Driver session invalidated during tab close: ${errorMsg}`);
            printLog("⚠️ This should not happen - session was closed unexpectedly");
            yield "hunting_next_job";
            return;
          } else {
            printLog(`Warning: Could not close Quick Apply tab: ${errorMsg}`);
          }
        }

        // Verify we're on a valid window and session is still active
        try {
          await ctx.driver.sleep(500); // Wait a bit for window operations to complete
          const remainingHandles = await ctx.driver.getAllWindowHandles();
          
          if (remainingHandles.length === 0) {
            printLog("❌ CRITICAL: No windows remaining - browser session was closed!");
            printLog("⚠️ This should not happen - all windows were closed");
            yield "hunting_next_job";
            return;
          }

          // Ensure we're on a valid window
          const currentHandle = await ctx.driver.getWindowHandle();
          if (!remainingHandles.includes(currentHandle)) {
            // We're on an invalid window, switch to a valid one
            printLog("⚠️ Current window is invalid, switching to valid window...");
            await ctx.driver.switchTo().window(remainingHandles[0]);
          }

          // Verify session is still valid
      const currentUrl = await ctx.driver.getCurrentUrl();
          printLog(`✅ Switched back to main window: ${currentUrl}`);
          printLog(`✅ Driver session is valid - ${remainingHandles.length} window(s) remaining`);
          
        } catch (sessionError) {
          const errorMsg = sessionError instanceof Error ? sessionError.message : String(sessionError);
          if (errorMsg.includes('session') || errorMsg.includes('session ID') || errorMsg.includes('quit')) {
            printLog(`❌ Driver session was invalidated: ${errorMsg}`);
            printLog("⚠️ Cannot continue - browser session was closed");
            yield "hunting_next_job";
            return;
    } else {
            printLog(`⚠️ Error verifying window switch: ${errorMsg}`);
            // Continue anyway - might be a transient error
          }
        }
      } else {
        // Only one window - navigate back instead of closing
        printLog("Only one window found, navigating back instead of closing");
        try {
          await ctx.driver.navigate().back();
          await ctx.driver.sleep(1000);
          const currentUrl = await ctx.driver.getCurrentUrl();
          printLog(`Navigated back to: ${currentUrl}`);
        } catch (navError) {
          printLog(`Warning: Could not navigate back: ${navError}`);
        }
      }

      printLog("✅ Application completed. Browser kept open for next job.");
      printLog("🔄 Ready to process next job in queue...");
      
    } catch (windowError) {
      const errorMsg = windowError instanceof Error ? windowError.message : String(windowError);
      printLog(`⚠️ Window handling error (continuing anyway): ${errorMsg}`);
      
      // Check if browser is still accessible
      try {
        await ctx.driver.getCurrentUrl();
        printLog("✅ Browser is still accessible, continuing...");
      } catch (browserError) {
        printLog(`❌ Browser is no longer accessible: ${browserError}`);
        // Don't yield error - let the workflow handle it
      }
    } finally {
      // Re-enable browser monitoring after window operations complete
      try {
        const enableMonitoring = (ctx.driver as any).__enableBrowserMonitoring;
        if (typeof enableMonitoring === 'function') {
          enableMonitoring();
        } else {
          printLog("⚠️ Browser monitoring enable function not available");
        }
      } catch (e) {
        // Monitor functions might not exist, that's ok
        printLog(`⚠️ Could not re-enable browser monitoring: ${e}`);
      }
    }
    
    // Keep browser open - don't quit it
    // The workflow can loop back or end gracefully without closing browser
    yield "hunting_next_job";

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    printLog(`❌ Close and continue error: ${errorMsg}`);
    
    // Re-enable monitoring even on error
    try {
      const enableMonitoring = (ctx.driver as any).__enableBrowserMonitoring;
      if (typeof enableMonitoring === 'function') {
        enableMonitoring();
      }
    } catch (e) {
      // Ignore - monitoring might not be set up
    }
    
    // Check if browser is still accessible
    try {
      await ctx.driver.getCurrentUrl();
      printLog("✅ Browser is still accessible despite error, continuing...");
    } catch (browserError) {
      printLog(`❌ Browser is no longer accessible: ${browserError}`);
    }
    
    // Try to continue anyway - keep browser open
    yield "hunting_next_job";
  }
}

// Pause for Cover Letter Review
export async function* pauseForCoverLetterReview(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  printLog("📄 COVER LETTER REVIEW TIME");
  printLog("🔍 Quickly review the AI-generated cover letter");
  printLog("📋 Check the personalization, tone, and relevance to the job posting");
  printLog("⏳ Briefly pausing for review...");

  // Short pause (2 seconds) just to allow the user to glance at the content
  await ctx.driver.sleep(2000);

  printLog("⏰ Review pause complete");
  printLog("▶️ Continuing with resume selection...");

  yield "review_complete";
}

// Stay Put for Manual Inspection
export async function* stayPutForInspection(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  printLog("🔍 STAYING PUT FOR MANUAL INSPECTION - Still on Choose Documents tab");
  printLog("📋 Check the form manually to see what validation errors are present");
  printLog("⏳ Brief pause for inspection, then will continue...");

  // Short pause (2 seconds) to allow a quick inspection without blocking for minutes
  await ctx.driver.sleep(2000);

  printLog("⏰ Inspection pause complete, continuing workflow...");
  yield "inspection_complete";
}

// Submit application on review page
export async function* submitApplication(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    printLog("Attempting to submit application...");

    const clicked = await ctx.driver.executeScript(`
      const candidates = [
        'button[data-automation="submitButton"]',
        'button[type="submit"]',
        '[data-testid="review-submit-button"]',
        '[data-automation="reviewSubmitButton"]'
      ];

      const isVisible = (el) => !!el && el.offsetParent !== null;
      for (const sel of candidates) {
        const el = document.querySelector(sel);
        if (isVisible(el)) {
          el.click();
          return { clicked: true, selector: sel };
        }
      }

      const buttons = Array.from(document.querySelectorAll('button'));
      const textButton = buttons.find((b) => {
        const t = (b.textContent || '').trim().toLowerCase();
        return isVisible(b) && (t.includes('submit application') || t === 'submit');
      });
      if (textButton) {
        textButton.click();
        return { clicked: true, selector: 'button:text-match' };
      }

      return { clicked: false, selector: '' };
    `) as { clicked: boolean; selector: string };

    if (clicked?.clicked) {
      printLog(`✅ Submit clicked using selector: ${clicked.selector}`);
      await ctx.driver.sleep(5000); // Wait longer for submission to process
      
      // Verify submission was successful by checking for success indicators
      let submissionConfirmed = false;
      try {
        const submissionStatus = await ctx.driver.executeScript(`
          // Check for common success indicators
          const successIndicators = [
            'application submitted',
            'application received',
            'thank you',
            'successfully submitted',
            'application complete',
            'submitted successfully',
            'your application has been submitted',
            'application sent'
          ];
          
          const pageText = document.body.innerText.toLowerCase();
          const url = window.location.href.toLowerCase();
          
          // Check page text for success messages
          const hasSuccessText = successIndicators.some(indicator => 
            pageText.includes(indicator)
          );
          
          // Check URL for success indicators
          const hasSuccessUrl = url.includes('submitted') || 
                                url.includes('success') || 
                                url.includes('confirmation') ||
                                url.includes('thank') ||
                                url.includes('complete');
          
          // Check for success elements
          const successElements = document.querySelectorAll(
            '[data-automation*="success"], [class*="success"], [id*="success"], [class*="confirmation"]'
          );
          
          // Check if submit button is gone (another indicator of success)
          const submitButtonStillVisible = document.querySelector('button[data-automation="submitButton"]') !== null;
          
          return {
            confirmed: hasSuccessText || hasSuccessUrl || successElements.length > 0 || !submitButtonStillVisible,
            hasSuccessText,
            hasSuccessUrl,
            successElementsCount: successElements.length,
            submitButtonGone: !submitButtonStillVisible
          };
        `) as { confirmed: boolean; hasSuccessText: boolean; hasSuccessUrl: boolean; successElementsCount: number; submitButtonGone: boolean };
        
        submissionConfirmed = submissionStatus.confirmed;
        
        if (submissionConfirmed) {
          printLog(`✅ Submission confirmed: success indicators found (text: ${submissionStatus.hasSuccessText}, URL: ${submissionStatus.hasSuccessUrl}, elements: ${submissionStatus.successElementsCount}, button gone: ${submissionStatus.submitButtonGone})`);
        } else {
          printLog(`⚠️ Submission confirmation unclear, but proceeding to mark as applied (submit button was clicked)`);
          // Still proceed - sometimes success indicators aren't immediately visible
          submissionConfirmed = true;
        }
      } catch (verifyError) {
        printLog(`⚠️ Could not verify submission status, but proceeding: ${verifyError}`);
        // Still proceed - assume success if submit button was clicked
        submissionConfirmed = true;
      }
      
      // CRITICAL: Always record application if submit button was clicked, regardless of verification
      // The submit button click is the definitive action that means the job should be marked as applied
      printLog(`📝 Recording application - submit button was clicked, marking as applied...`);
      printLog(`   Current job file: ${ctx.currentJobFile || 'NOT SET'}`);
      printLog(`   Current job dir: ${ctx.currentJobDir || 'NOT SET'}`);
      printLog(`   Current job title: ${ctx.currentJobTitle || 'NOT SET'}`);
      
      // Always try to record - don't skip if currentJobFile is missing, try to recover it
      let jobFileToUse = ctx.currentJobFile;
      
      if (!jobFileToUse && ctx.currentJobDir) {
        const possibleJobFile = path.join(ctx.currentJobDir, 'job_details.json');
        if (fs.existsSync(possibleJobFile)) {
          printLog(`   ✅ Recovered job file from currentJobDir: ${possibleJobFile}`);
          jobFileToUse = possibleJobFile;
          ctx.currentJobFile = possibleJobFile;
        }
      }
      
      if (jobFileToUse) {
        try {
          if (!fs.existsSync(jobFileToUse)) {
            printLog(`❌ [JobRecorder] Job file does not exist: ${jobFileToUse}`);
            throw new Error(`Job file not found: ${jobFileToUse}`);
          }
          
          const jobData = JSON.parse(fs.readFileSync(jobFileToUse, 'utf8'));
          printLog(`   ✅ Job file loaded, keys: ${Object.keys(jobData).join(', ')}`);
          
          // Try multiple ways to get jobId: from jobData, from URL in jobData, or from current URL
          let jobId = jobData.jobId || jobData.job_id || '';
          
          // If not in jobData, try to extract from URL in jobData
          if (!jobId && jobData.url) {
            try {
              const urlMatch = jobData.url.match(/job\/(\d+)/);
              if (urlMatch) {
                jobId = urlMatch[1];
                printLog(`📝 Extracted jobId from URL in job file: ${jobId}`);
              }
            } catch (e) {
              // Ignore URL parsing errors
            }
          }
          
          // If still no jobId, try to get from current browser URL
          if (!jobId) {
            try {
              const currentUrl = await ctx.driver.getCurrentUrl();
              const urlMatch = currentUrl.match(/job\/(\d+)/);
              if (urlMatch) {
                jobId = urlMatch[1];
                printLog(`📝 Extracted jobId from current browser URL: ${jobId}`);
              } else {
                // Try query param
                try {
                  const url = new URL(currentUrl);
                  jobId = url.searchParams.get('jobId') || '';
                  if (jobId) {
                    printLog(`📝 Extracted jobId from URL query param: ${jobId}`);
                  }
                } catch (e) {
                  // Ignore URL parsing errors
                }
              }
            } catch (e) {
              printLog(`⚠️ Could not get current URL to extract jobId: ${e}`);
            }
          }
          
          // Last resort: use timestamp as fallback (but still try to record)
          if (!jobId) {
            jobId = Date.now().toString();
            printLog(`⚠️ No jobId found, using timestamp fallback: ${jobId}`);
          }
          
          if (jobId) {
            printLog(`📝 Recording application with status 'applied' for job ${jobId}...`);
            printLog(`   Job file: ${jobFileToUse}`);
            printLog(`   Job ID: ${jobId}`);
            printLog(`   Title: ${jobData.title || 'N/A'}`);
            printLog(`   Company: ${jobData.company || 'N/A'}`);
            
            const jobDirPath = getJobDirPathFromJobFile(jobFileToUse, jobId);
            printLog(`   Job dir path: ${jobDirPath}`);
            
            const result = await recordJobApplicationToBackend({
              jobFilePath: jobFileToUse,
              jobDirPath,
              platform: 'seek'
            });
            if (result.ok) {
              printLog(`✅ Application recorded successfully with status 'applied' in database`);
              printLog(`✅ Job ${jobId} marked as APPLIED`);
            } else {
              printLog(`❌ [JobRecorder] CRITICAL: Backend record failed: ${result.error}`);
              printLog(`   This means the job was NOT marked as applied in the database!`);
            }
          } else {
            printLog(`❌ [JobRecorder] CRITICAL: Could not determine jobId, cannot mark as applied`);
            printLog(`   Job file exists: ${ctx.currentJobFile}`);
            if (jobData) {
              printLog(`   Job file content keys: ${Object.keys(jobData).join(', ')}`);
              printLog(`   Job data URL: ${jobData.url || 'N/A'}`);
            }
          }
        } catch (recordErr) {
          const errorMsg = recordErr instanceof Error ? recordErr.message : String(recordErr);
          printLog(`❌ [JobRecorder] CRITICAL ERROR - Record failed: ${errorMsg}`);
          if (recordErr instanceof Error && recordErr.stack) {
            printLog(`   Stack: ${recordErr.stack.substring(0, 500)}`);
          }
        }
      } else {
        printLog(`❌ [JobRecorder] CRITICAL: No currentJobFile in context, cannot mark as applied`);
        printLog(`   Context has job-related keys: ${Object.keys(ctx).filter(k => k.toLowerCase().includes('job')).join(', ') || 'NONE'}`);
        printLog(`   Current job title: ${ctx.currentJobTitle || 'N/A'}`);
        printLog(`   Current job company: ${ctx.currentJobCompany || 'N/A'}`);
        printLog(`   Current job dir: ${ctx.currentJobDir || 'N/A'}`);
        
        // Try to find job file from context or reconstruct it
        if (ctx.currentJobDir) {
          const possibleJobFile = path.join(ctx.currentJobDir, 'job_details.json');
          if (fs.existsSync(possibleJobFile)) {
            printLog(`   ✅ Found job file in currentJobDir: ${possibleJobFile}`);
            ctx.currentJobFile = possibleJobFile;
            // Retry recording
            try {
              const jobData = JSON.parse(fs.readFileSync(possibleJobFile, 'utf8'));
              let jobId = jobData.jobId || jobData.job_id || '';
              if (!jobId && jobData.url) {
                const urlMatch = jobData.url.match(/job\/(\d+)/);
                if (urlMatch) jobId = urlMatch[1];
              }
              if (!jobId) {
                try {
                  const currentUrl = await ctx.driver.getCurrentUrl();
                  const urlMatch = currentUrl.match(/job\/(\d+)/);
                  if (urlMatch) jobId = urlMatch[1];
                } catch (e) {
                  // Ignore
                }
              }
              if (jobId) {
                printLog(`   🔄 Retrying with recovered job file, jobId: ${jobId}`);
                const jobDirPath = getJobDirPathFromJobFile(possibleJobFile, jobId);
                const result = await recordJobApplicationToBackend({
                  jobFilePath: possibleJobFile,
                  jobDirPath,
                  platform: 'seek'
                });
                if (result.ok) {
                  printLog(`✅ Application recorded successfully with status 'applied' (recovered from context)`);
                  printLog(`✅ Job ${jobId} marked as APPLIED`);
                } else {
                  printLog(`❌ [JobRecorder] Retry also failed: ${result.error}`);
                }
              } else {
                printLog(`   ⚠️ Could not extract jobId even from recovered file`);
              }
            } catch (retryErr) {
              printLog(`   ❌ Retry failed: ${retryErr}`);
            }
          } else {
            printLog(`   ⚠️ Job file not found at expected path: ${possibleJobFile}`);
          }
        }
      }
      
      yield "application_submitted";
    } else {
      printLog("Submit button not found on review page.");
      yield "submit_not_found";
    }
  } catch (error) {
    printLog(`Submit application failed: ${error}`);
    yield "submit_failed";
  }
}

// Skip to Next Card
export async function* skipToNextCard(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  const title = ctx.currentJobTitlePreview || ctx.currentJobTitle;
  const company = ctx.currentJobCompanyPreview || ctx.currentJobCompany;
  if (title || company) {
    printLog(`Skipping (regular apply): ${title || '?'} at ${company || '?'}`);
  } else {
    printLog("Regular Apply job found - skipping");
  }

  ctx.jobs_scanned = (ctx.jobs_scanned || 0) + 1;

  // Update progress counter if overlay exists
  if (ctx.overlay) {
    const skippedJobs = (ctx.skipped_jobs || 0) + 1;
    ctx.skipped_jobs = skippedJobs;
    const displayTotal = (ctx.maxJobsLimit || 0) > 0 ? ctx.maxJobsLimit : (ctx.total_jobs || 0);
    const numerator = ctx.jobs_extracted || 0;

    await ctx.overlay.addLogEvent(`\u23ed\ufe0f Scanning (${ctx.jobs_scanned}): ${title || 'job'} @ ${company || '?'} — regular apply`);
    await ctx.overlay.updateJobProgress(
      numerator,
      displayTotal,
      `Scanning: ${title || '?'}`,
      8
    );
  }

  yield "card_skipped";
}

// Click Next Page
export async function* clickNextPage(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    printLog("Checking for next page button...");

    const nextButton = await ctx.driver.executeScript(`
      const nextButton = document.querySelector('a[rel=\"nofollow next\"]');
      if (nextButton && !nextButton.hasAttribute('disabled')) {
        nextButton.click();
        return true;
      }
      return false;
    `);

    if (nextButton) {
      printLog("Next page button clicked.");
      await ctx.driver.sleep(3000); // Wait for page to load
      yield "next_page_clicked";
    } else {
      printLog("No more pages found.");
      yield "no_more_pages";
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/no such window|target window already closed|web view not found/i.test(msg)) {
      printLog("Next page: window closed, treating as no more pages.");
    } else {
      printLog(`Error clicking next page: ${msg}`);
    }
    yield "no_more_pages";
  }
}

// Skip resume only
export async function* skipResume(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    printLog("Skipping resume selection...");

    // Handle resume selection - click "Don't include a resumé"
    try {
      const noResumeRadio = await ctx.driver.findElement(By.xpath("//label[contains(., \"Don't include a resumé\")]"));
      await noResumeRadio.click();
      printLog('✅ Selected "Don\'t include a resumé"');
      await ctx.driver.sleep(1000);
      yield "resume_skipped";
    } catch (e) {
      printLog('⚠️ Could not find "Don\'t include a resumé" option');
      yield "resume_skip_failed";
    }
  } catch (error) {
    printLog(`Error skipping resume: ${error}`);
    yield "resume_skip_failed";
  }
}

// Skip documents (both resume and cover letter)
export async function* skipDocuments(ctx: WorkflowContext): AsyncGenerator<string, void, unknown> {
  try {
    printLog("Skipping resume and cover letter selection...");

    // Handle resume selection - click "Don't include a resumé"
    try {
      const noResumeRadio = await ctx.driver.findElement(By.xpath("//label[contains(., \"Don't include a resumé\")]"));
      await noResumeRadio.click();
      printLog('✅ Selected "Don\'t include a resumé"');
      await ctx.driver.sleep(1000);
    } catch (e) {
      printLog('⚠️ Could not find "Don\'t include a resumé" option');
    }

    // Handle cover letter selection - click "Don't include a cover letter"
    try {
      const noCoverLetterRadio = await ctx.driver.findElement(By.xpath("//label[contains(., \"Don't include a cover letter\")]"));
      await noCoverLetterRadio.click();
      printLog('✅ Selected "Don\'t include a cover letter"');
      await ctx.driver.sleep(1000);
    } catch (e) {
      printLog('⚠️ Could not find "Don\'t include a cover letter" option');
    }

    yield "documents_skipped";
  } catch (error) {
    printLog(`Error skipping documents: ${error}`);
    yield "documents_skip_failed";
  }
}

export const seekStepFunctions = {
  step0,
  openJobUrl,
  openHomepage,
  waitForPageLoad,
  refreshPage,
  detectPageState,
  fillSearchForm,
  clickSearchButton,
  showSignInBanner,
  performBasicSearch,
  applySeekFilters,
  collectJobCards,
  clickJobCard,
  detectApplyType,
  parseExternalJobDetails,
  parseJobDetails,
  saveScrapedJob,
  clickQuickApply,
  waitForQuickApplyPage,
  getCurrentStep,
  handleResumeSelection,
  handleCoverLetter,
  extractEmployerQuestions,
  handleEmployerQuestions,
  clickContinueButton,
  checkForSubmitButton,
  closeQuickApplyAndContinueSearch,
  stayPutForInspection,
  pauseForCoverLetterReview,
  submitApplication,
  skipToNextCard,
  skipResume,
  skipDocuments,
  clickNextPage,
  waitForNextConfirm
};