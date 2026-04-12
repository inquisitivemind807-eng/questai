/**
 * Indeed Bot Implementation
 * -------------------------------------------------------------
 * Playwright + Camoufox implementation of the Indeed bot.
 * Overcomes stealth protections using Firefox Camoufox instead of Chrome.
 */

import fetch from 'node-fetch';
import * as path from 'path';
import * as fs from 'fs';
import { UniversalOverlay } from '../core/universal_overlay';

class PlaywrightDriverAdapter {
    constructor(private page: any) { }
    async executeScript(script: string, ...args: any[]) {
        if (this.page.isClosed()) throw new Error("Target closed");
        try {
            // Selenium scripts often expect 'arguments' array to be available globally or in scope
            // We wrap the script in a function that receives the arguments.
            return await this.page.evaluate(({ s, a }: { s: string, a: any[] }) => {
                try {
                    const fn = new Function('...arguments', s);
                    return fn(...a);
                } catch (innerError) {
                    // If not a return-based script, try just executing it
                    return new Function(s)();
                }
            }, { s: script, a: args });
        } catch (e: any) {
            const msg = e?.message || "";
            if (msg.includes('closed') || msg.includes('disconnected') || msg.includes('Target page') || msg.includes('context destroyed')) {
                throw e; // Rethrow to let the caller know the browser is dead
            }
            console.error('[DEV] adapter.executeScript error:', e);
            return null;
        }
    }
}

export async function* step0(ctx: any) {
    if (!ctx.state) ctx.state = {};
    if (!ctx.page) {
        console.log('indeed.step0', 'Booting Camoufox (Playwright) stealth engine...');
        const { Camoufox } = await import('camoufox-js');

        const sessionsDir = path.join(process.cwd(), 'sessions', 'indeed', 'camoufox_profile');
        if (!fs.existsSync(sessionsDir)) {
            fs.mkdirSync(sessionsDir, { recursive: true });
        }

        // Fallback to software rendering for systems without proper graphics drivers (e.g. Pop!_OS Mac)
        process.env.MOZ_DISABLE_CONTENT_SANDBOX = '1';
        process.env.LIBGL_ALWAYS_SOFTWARE = '1';
        process.env.MOZ_ACCELERATED = '0';

        ctx.sessionExists = fs.readdirSync(sessionsDir).filter(file => !['screenshots', 'logs', 'resume', 'temp'].includes(file)).length > 0;

        try {
            const browser = await Camoufox({
                headless: ctx.config?.headless === true,
                user_data_dir: sessionsDir,
                window: [1920, 1080]
            });
            ctx.browser = browser;

            // Handle browser closure immediately (BrowserContext uses 'close')
            browser.on('close', () => {
                console.error('[DEV] 🛑 Indeed Browser was closed. Exiting...');
                process.exit(1);
            });

            // Camoufox with user_data_dir persists context, so it returns a BrowserContext.
            const pages = await browser.pages();
            ctx.page = pages.length > 0 ? pages[0] : await browser.newPage();

            // Try to maximize window via JS and set viewport
            try {
                await ctx.page.setViewportSize({ width: 1920, height: 1080 });
            } catch (e) { }

            ctx.overlay = new UniversalOverlay(new PlaywrightDriverAdapter(ctx.page) as any, 'Indeed');
            
            // NOTE: We don't initialize overlay yet because we might be on about:blank
            // We'll initialize it in openCheckLogin or showManualLoginPrompt

            console.log('indeed.step0', `Camoufox stealth engine ready. Profile: ${sessionsDir}`);
        } catch (error) {
            console.error('indeed.step0', 'Critical fatal error launching Camoufox', error);
            throw error;
        }
    }

    console.log('indeed.step0', 'Starting Indeed.com extraction workflow...');

    if (ctx.config?.directApplyUrl) {
        yield 'direct_apply_requested';
        return;
    }
    yield 'step0_complete';
}

export async function* navigateToDirectApplyUrl(ctx: any) {
    try {
        const jobUrl = ctx.config?.directApplyUrl;
        if (!jobUrl) throw new Error("No Direct Apply URL provided");
        await ctx.page.goto(jobUrl, { waitUntil: 'load', timeout: 30000 });
        await ctx.page.waitForTimeout(3000);
        
        // Ensure overlay is ready on the job page
        if (ctx.overlay) {
            await ctx.overlay.initialize().catch(() => {});
            await ctx.overlay.addLogEvent(`🎯 Direct Apply: Page loaded`).catch(() => {});
        }
        
        yield 'navigated';
    } catch (error) {
        console.error('indeed.navigate', 'Failed to navigate to direct apply', error);
        yield 'navigation_failed';
    }
}

export async function* openCheckLogin(ctx: any) {
    console.log('indeed.checkLogin', 'Checking login status...');
    try {
        if (!ctx.sessionExists) {
            console.log('indeed.checkLogin', 'No active Camoufox session found. Clean profile.');
            yield 'user_needs_to_login';
            return;
        }

        const currentUrl = ctx.page.url();
        if (!currentUrl.includes('indeed.com')) {
            await ctx.page.goto('https://www.indeed.com/', { waitUntil: 'domcontentloaded' });
            await ctx.page.waitForTimeout(3000);
        }

        // Initialize/Refresher Overlay on the real page
        if (ctx.overlay) {
            await ctx.overlay.initialize().catch(() => {});
            await ctx.overlay.addLogEvent('✅ Indeed page loaded. Checking login...').catch(() => {});
        }

        // Wait a few seconds for the page to fully render before checking DOM elements
        await ctx.page.waitForTimeout(5000);

        // A simple count is safer than isVisible(), because a smaller viewport
        // might hide the 'Sign in' button inside a hamburger menu, making it "invisible"
        // and falsely triggering a "logged in" state.
        const loginBtnSelector = "a[href*='/auth'], a[href*='/account/login'], a:has-text('Sign in'), a:has-text('Sign In')";
        const signInBtnCount = await ctx.page.locator(loginBtnSelector).count();
        
        // Also check for Indeed specific auth cookies
        const cookies = await ctx.page.context().cookies();
        const hasAuthCookies = cookies.some((c: any) => c.name === 'SHOE' || c.name.includes('PassportAuthProxy'));

        const isLoggedIn = (signInBtnCount === 0) && hasAuthCookies;

        if (isLoggedIn) {
            console.log('indeed.checkLogin', 'Session is authenticated.');
            yield 'login_not_needed';
        } else {
            console.log('indeed.checkLogin', `User is not logged in. (Sign-in buttons found: ${signInBtnCount}, Auth Cookies: ${hasAuthCookies})`);
            yield 'user_needs_to_login';
        }
    } catch (error) {
        console.error('indeed.checkLogin', 'Failed checking login', error);
        yield 'failed_checking_login_status';
    }
}

export async function* showManualLoginPrompt(ctx: any) {
    console.log('indeed.login', 'Pausing for manual login...');
    console.warn('indeed.login', 'ACTION REQUIRED: Please enter your credentials and log in to Indeed.');

    try {
        // Ensure overlay is initialized
        if (ctx.overlay) {
            await ctx.overlay.initialize().catch(() => {});
        }

        const loginBtnSelector = "a[href*='/auth'], a[href*='/account/login'], a:has-text('Sign in'), a:has-text('Sign In')";
        const btn = ctx.page.locator(loginBtnSelector).first();
        if (await btn.count() > 0) {
            await btn.click({ force: true }).catch(() => { });
        }

        // Trigger the Universal Overlay's Sign In banner format
        if (ctx.overlay) {
            await ctx.overlay.showSignInOverlay().catch(() => {});
        } else {
            // Fallback Banner just in case overlay failed
            await ctx.page.evaluate(() => {
                const id = 'universal-login-banner';
                if (document.getElementById(id)) return;
                const banner = document.createElement('div');
                banner.id = id;
                banner.innerHTML = '🔴 PLEASE LOG IN TO INDEED 🔴<br>The bot is waiting for you...';
                Object.assign(banner.style, {
                    position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
                    background: '#ff4444', color: 'white', padding: '15px 20px',
                    borderRadius: '8px', fontSize: '16px', fontWeight: 'bold',
                    textAlign: 'center', zIndex: '999999', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    fontFamily: 'Arial, sans-serif'
                });
                document.body.appendChild(banner);
            }).catch(() => { });
        }

        let authenticated = false;
        
        // Wait up to ~6 minutes (120 iterations * 3s)
        for (let i = 0; i < 120; i++) {
            if (ctx.page.isClosed()) throw new Error('Browser closed during login pause');
            
            await ctx.page.waitForTimeout(3000);
            
            // Check if user clicked the "✅ I have logged in - Continue" button on the Overlay
            const isClickConfirmed = await ctx.page.evaluate(() => {
                return (window as any).__overlaySignInComplete === true || sessionStorage.getItem('overlay_signin_complete') === 'true';
            }).catch(() => false);

            // Also passively check for secure auth cookies if they fully log in but forget to click the button
            const cookies = await ctx.page.context().cookies();
            const hasAuthCookies = cookies.some((c: any) => c.name.includes('PassportAuthProxy') || c.name.includes('SHOE'));

            if (isClickConfirmed || hasAuthCookies) {
                authenticated = true;
                
                // Clear the state so it doesn't instantly trigger on future steps
                await ctx.page.evaluate(() => {
                    (window as any).__overlaySignInComplete = false;
                    sessionStorage.removeItem('overlay_signin_complete');
                    const b = document.getElementById('universal-login-banner');
                    if (b) b.remove();
                }).catch(() => {});
                
                break;
            }
        }

        if (authenticated) {
            console.log('indeed.login', 'Login confirmed! Proceeding...');
            if (ctx.overlay) {
                await ctx.overlay.updateJobProgress(0, 0, 'Login confirmed, proceeding...', 1).catch(() => {});
            }
            yield 'login_successful';
        } else {
            console.warn('indeed.login', 'Login timed out.');
            yield 'login_failed';
        }
    } catch (error) {
        console.error('indeed.login', 'Error during manual login flow', error);
        yield 'error_showing_manual_login';
    }
}

// --- Filter helpers ---

function normalizeJobType(jt: string): string {
    const map: Record<string, string> = {
        'full-time': 'fulltime', 'fulltime': 'fulltime',
        'part-time': 'parttime', 'parttime': 'parttime',
        'contract': 'contract', 'temporary': 'temporary',
        'internship': 'internship'
    };
    return map[jt?.toLowerCase()] || '';
}

function normalizeFromage(listed: string): string {
    const map: Record<string, string> = {
        '1d': '1', '3d': '3', '7d': '7', '14d': '14',
        '1': '1', '3': '3', '7': '7', '14': '14'
    };
    return map[listed?.toLowerCase()] || '';
}

function normalizeExperienceLevel(lvl: string): string {
    const map: Record<string, string> = {
        'entry': 'entry_level', 'entry_level': 'entry_level',
        'mid': 'mid_level', 'mid_level': 'mid_level',
        'senior': 'senior_level', 'senior_level': 'senior_level'
    };
    return map[lvl?.toLowerCase()] || '';
}

async function handleLocationDialog(ctx: any): Promise<void> {
    const page = ctx.page;
    const userLocation = ctx.config?.locations || "";
    try {
        console.log('indeed.openJobs', 'Checking for location confirmation dialog...');
        // Dialog can appear with specific selectors
        const dialogSelector = 'div.eofpmnx1, div[aria-live="polite"]:has-text("only")';
        const yesBtnSelector = 'div.eofpmnx1 button:has-text("Yes"), button.css-1ua5vtl:has-text("Yes"), button:has-text("Yes")';
        
        const dialog = page.locator(dialogSelector).first();
        const yesBtn = page.locator(yesBtnSelector).first();
        
        try {
            await dialog.waitFor({ state: 'visible', timeout: 3000 });
        } catch (e) {
            return;
        }

        const dialogText = await dialog.innerText();
        console.log('indeed.openJobs', `Location dialog found: "${dialogText.substring(0, 50)}..."`);
        
        // If the location in the dialog matches our preferred location, click Yes
        if (userLocation && dialogText.toLowerCase().includes(userLocation.toLowerCase())) {
            console.log('indeed.openJobs', `Location matches preference ("${userLocation}") — clicking Yes`);
            await yesBtn.click({ force: true });
            await page.waitForTimeout(2000);
        } else {
            console.log('indeed.openJobs', 'Location does not match preference — ignoring dialog');
        }
    } catch (e) {
        console.warn('indeed.openJobs', 'Error handling location dialog', e);
    }
}

/**
 * Dynamically discover and interact with Indeed's search filters.
 */
async function handleDynamicFilters(ctx: any): Promise<void> {
    const page = ctx.page;
    const config = ctx.config;
    
    try {
        console.log('indeed.filters', 'Starting dynamic filter discovery...');
        
        // Scan for common filter buttons (ids like taxo1_filter_button, fromAge_filter_button, etc.)
        const filterButtonSelector = 'button[id$="_filter_button"], button[aria-label$=" filter"]';
        const filterButtons = page.locator(filterButtonSelector);
        const count = await filterButtons.count();
        
        console.log('indeed.filters', `Found ${count} potentially dynamic filter buttons.`);
        
        for (let i = 0; i < count; i++) {
            const btn = filterButtons.nth(i);
            const label = await btn.innerText();
            const id = await btn.getAttribute('id') || '';
            const ariaLabel = await btn.getAttribute('aria-label') || '';
            
            console.log('indeed.filters', `Filter index ${i}: label="${label}", id="${id}", ariaLabel="${ariaLabel}"`);
            
            // 1. Handle "Date posted" filter (fromAge)
            if ((label.includes('Date posted') || ariaLabel.includes('Date posted')) && config.listedDate) {
                await applyFilterOption(page, btn, config.listedDate, ['Last 24 hours', 'Last 3 days', 'Last 7 days', 'Last 14 days'], 'Date posted');
            }
            // 2. Handle "Remote" filter
            else if ((label.includes('Remote') || ariaLabel.includes('Remote')) && config.remotePreference) {
                await applyFilterOption(page, btn, config.remotePreference, ['Remote', 'Hybrid', 'On-site'], 'Remote');
            }
            // 3. Handle "Developer skill" or "Specialty" or "Shift and schedule" (Generic Dynamic Filters)
            else if (config.keywords && (id.includes('taxo') || label.includes('skill') || label.includes('Specialty'))) {
                // For skills, we might want to select multiples if they match our keywords
                await applyDynamicKeywordsFilter(page, btn, config.keywords);
            }
        }
    } catch (e) {
        console.warn('indeed.filters', 'Error during dynamic filter handling', e);
    }
}

async function applyFilterOption(page: any, btn: any, value: string, knownOptions: string[], filterType: string): Promise<void> {
    try {
        console.log('indeed.filters', `Attempting to apply "${value}" to ${filterType} filter...`);
        await btn.click({ force: true });
        await page.waitForTimeout(1000);
        
        // Find the option in the dropdown that matches our value
        const normalizedValue = value.toLowerCase();
        const optionsList = page.locator('ul[role="listbox"] li, ul[role="menu"] li');
        const optCount = await optionsList.count();
        
        for (let j = 0; j < optCount; j++) {
            const opt = optionsList.nth(j);
            const optText = await opt.innerText();
            if (optText.toLowerCase().includes(normalizedValue)) {
                console.log('indeed.filters', `Found matching option: "${optText}" — clicking`);
                await opt.click({ force: true });
                await page.waitForTimeout(1500);
                return;
            }
        }
        
        // If not found by direct match, try a looser match against knownOptions
        console.log('indeed.filters', `No direct match for "${value}" in ${filterType}.`);
        // Close the dropdown if still open
        await page.keyboard.press('Escape');
    } catch (e) {
        console.warn('indeed.filters', `Failed to apply ${filterType} filter`, e);
    }
}

async function applyDynamicKeywordsFilter(page: any, btn: any, keywords: string): Promise<void> {
    try {
        console.log('indeed.filters', `Exploring dynamic keywords filter for: ${keywords}...`);
        await btn.click({ force: true });
        await page.waitForTimeout(1000);
        
        const individualKeywords = keywords.split(/[,|]/).map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
        const optionsList = page.locator('ul[role="menu"] li, ul[role="listbox"] li');
        const optCount = await optionsList.count();
        let clickedAny = false;
        
        for (let j = 0; j < optCount; j++) {
            const opt = optionsList.nth(j);
            const optText = (await opt.innerText()).toLowerCase();
            
            for (const kw of individualKeywords) {
                if (optText.includes(kw)) {
                    console.log('indeed.filters', `Keyword match: "${kw}" in option "${optText}" — clicking`);
                    await opt.click({ force: true });
                    clickedAny = true;
                    await page.waitForTimeout(500);
                    break;
                }
            }
        }
        
        if (clickedAny) {
            // Find the "Update" or "Apply" button inside the dropdown if it exists
            const updateBtn = page.locator('button:has-text("Update"), button:has-text("Apply")').first();
            if (await updateBtn.count() > 0) {
                await updateBtn.click({ force: true });
                await page.waitForTimeout(2000);
            }
        } else {
            await page.keyboard.press('Escape');
        }
    } catch (e) {
        console.warn('indeed.filters', 'Failed to apply dynamic keyword filter', e);
    }
}

export async function* openJobsPage(ctx: any) {
    console.log('indeed.openJobs', 'Navigating to search page...');
    try {
        const fd = ctx.config?.formData || {};
        const keywords  = fd.keywords  || '';
        const location  = fd.locations || '';
        const jobType   = normalizeJobType(fd.jobType || '');
        const fromage   = normalizeFromage(fd.listedDate || '');
        const isRemote  = (fd.remotePreference || '').toLowerCase() === 'remote';
        const radius    = fd.radius || '';
        const explvl    = normalizeExperienceLevel(fd.experienceLevel || '');
        const minSalary = fd.minSalary || '';
        // User can drop a raw Indeed sc= string in config for advanced taxo* filters
        const sc        = fd.indeedSc || '';

        const params = new URLSearchParams();
        
        // Indeed often handles salary best when appended to the query, e.g. "Software Engineer $100,000"
        let searchQuery = keywords;
        if (minSalary) {
            const formattedSalary = minSalary.includes('$') ? minSalary : `$${minSalary}`;
            searchQuery += ` ${formattedSalary}`;
        }
        params.set('q', searchQuery);

        if (location) params.set('l', location);
        if (jobType)  params.set('jt', jobType);
        if (fromage)  params.set('fromage', fromage);
        if (isRemote) params.set('remotejob', '1');
        if (radius)   params.set('radius', String(radius));
        if (explvl)   params.set('explvl', explvl);
        if (sc)       params.set('sc', sc);

        const url = `https://www.indeed.com/jobs?${params.toString()}`;
        console.log('indeed.openJobs', `Search URL: ${url}`);

        // Initial navigation
        await ctx.page.goto(url, { waitUntil: 'domcontentloaded' });
        
        // Indeed often does a series of redirects or loads filters via JS. 
        // Wait for results to actually land.
        await ctx.page.waitForTimeout(4000);

        // Auto-handle the "Do you want to see results in [location] only?" dialog
        await handleLocationDialog(ctx);

        // EXTRA: Handle dynamic filters identified in indeed_search_filter.html
        if (ctx.config?.botMode === 'superbot' || ctx.config?.botMode === 'harvester') {
            await handleDynamicFilters(ctx);
        }

        if (ctx.overlay) {
            await ctx.overlay.initialize().catch(() => {});
            await ctx.overlay.showJobProgress(0, 0, `Searching: ${searchQuery} in ${location || 'Anywhere'}`, 1).catch(() => { });
        }

        yield 'jobs_page_loaded';
    } catch (error) {
        console.error('indeed.openJobs', error);
        yield 'failed_opening_jobs_page';
    }
}

export async function* setSearchKeywords(ctx: any) {
    yield 'search_keywords_set';
}

export async function* setSearchLocation(ctx: any) {
    yield 'search_location_set';
}

export async function* getPageInfo(ctx: any) {
    console.log('indeed.pagination', 'Extracting pagination info...');
    ctx.state.currentPage = ctx.state.currentPage || 1;
    ctx.state.scrapedJobs = ctx.state.scrapedJobs || [];
    await ctx.page.waitForTimeout(2000);
    yield 'page_info_extracted';
}

export async function* extractJobDetails(ctx: any) {
    console.log('indeed.extract', 'Extracting job cards...');
    try {
        const containerSelector = ctx.selectors.jobCards?.container || 'div.job_seen_beacon, td.resultContent, div[data-testid="slider_item"]';

        // Let it wait for network / slow renders
        await ctx.page.waitForSelector(containerSelector, { timeout: 15000 }).catch(() => { });

        const cards = ctx.page.locator(containerSelector);
        const cardCount = await cards.count();

        if (cardCount === 0) {
            if (ctx.state.currentPage > 5) yield 'no_job_cards_found';
            else {
                await ctx.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await ctx.page.waitForTimeout(3000);
                yield 'failed_extracting_jobs';
            }
            return;
        }

        ctx.state.currentJobCards = [];

        for (let i = 0; i < cardCount; i++) {
            const card = cards.nth(i);
            try {
                let title = 'Unknown', company = 'Unknown', jobId = Date.now().toString(), url = '';
                let location = 'Unknown', salary = 'Not listed', postedDate = 'Unknown';

                try {
                    const titleLink = card.locator('h2.jobTitle a, h2 a').first();
                    if (await titleLink.count() > 0) {
                        title = await titleLink.innerText();
                        url = await titleLink.getAttribute('href') || '';
                        jobId = await titleLink.getAttribute('data-jk') || jobId;
                    }
                } catch (e) { }

                ctx.overlay?.updateJobProgress(i + 1, cardCount, `Extracting: ${title}`, 3).catch(() => { });

                try {
                    const compEl = card.locator('[data-testid="company-name"]').first();
                    if (await compEl.count() > 0) company = await compEl.innerText();
                } catch (e) { }

                try {
                    const locEl = card.locator('[data-testid="text-location"]').first();
                    if (await locEl.count() > 0) location = await locEl.innerText();
                } catch (e) { }

                try {
                    const salEl = card.locator('div.salary-snippet-container, div.metadataContainer [data-testid="attribute_snippet_testid"]').first();
                    if (await salEl.count() > 0) salary = await salEl.innerText();
                } catch (e) { }

                try {
                    const dateEl = card.locator('span.date, span[data-testid="myJobsStateDate"]').first();
                    if (await dateEl.count() > 0) postedDate = await dateEl.innerText();
                } catch (e) { }

                // DEEP EXTRACTION
                let description = '';
                try {
                    await card.scrollIntoViewIfNeeded().catch(() => { });
                    await card.click({ force: true, delay: 100 }).catch(() => { });

                    // Indeed's right pane is a recycled React component. waitForSelector matches the loading skeleton instantly!
                    // We must use a hard timeout to wait for the GraphQL request to hydrate the DOM.
                    await ctx.page.waitForTimeout(2500);

                    const descEl = ctx.page.locator('#jobDescriptionText, .jobsearch-JobComponent-description').first();
                    if (await descEl.count() > 0) {
                        description = await descEl.innerText();
                    }
                } catch (e) {
                    console.warn(`indeed.extract.deep`, `Could not extract description for ${title}`);
                }

                const job = { title, company, location, salary, postedDate, url, jobId, description, platform: 'indeed' };
                ctx.state.currentJobCards.push(job);

                // Immediately save one-by-one (Incremental DB Sync)
                try {
                    const tokenPath = path.join(process.cwd(), '.cache', 'api_token.txt');
                    const token = fs.existsSync(tokenPath) ? fs.readFileSync(tokenPath, 'utf8').trim() : '';
                    
                    const response = await fetch('http://localhost:3000/api/scraped-jobs', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json', 
                            'Authorization': `Bearer ${token}` 
                        },
                        body: JSON.stringify({
                            ...job,
                            platformJobId: job.jobId,
                            rawData: job
                        })
                    });

                    if (response.ok) {
                        const resData = await response.json();
                        console.log('indeed.save', `✅ Saved job: ${title} (ID: ${resData.id})`);
                        if (ctx.overlay) {
                            await ctx.overlay.addLogEvent(`💾 Saved: ${title}`).catch(() => {});
                        }
                    } else {
                        const errorText = await response.text();
                        console.error('indeed.save', `❌ Failed to save job: ${title} (${response.status}): ${errorText}`);
                    }
                } catch (saveError) {
                    console.error('indeed.save', `⚠️ Network error saving job: ${title}`, saveError);
                }
            } catch (e) { }
        }

        yield 'proceed_to_process_jobs';
    } catch (error) {
        console.error('indeed.extract', error);
        yield 'failed_extracting_jobs';
    }
}

export async function* processJobs(ctx: any) {
    if (!ctx.state.scrapedJobs) ctx.state.scrapedJobs = [];
    ctx.state.scrapedJobs = ctx.state.scrapedJobs.concat(ctx.state.currentJobCards || []);
    console.log('indeed.process', `Job batch sync complete. Total accumulated: ${ctx.state.scrapedJobs.length}`);
    ctx.overlay?.updateJobProgress(ctx.state.scrapedJobs.length, ctx.state.scrapedJobs.length, `Finished processing ${ctx.state.currentJobCards?.length || 0} jobs`, 4).catch(() => { });
    yield 'jobs_saved';
}

export async function* attemptEasyApply(ctx: any) {
    console.log('indeed.apply', 'Attempting direct apply...');
    try {
        if (ctx.config?.directApplyUrl) {
            await ctx.page.goto(ctx.config.directApplyUrl, { waitUntil: 'domcontentloaded' });
            await ctx.page.waitForTimeout(4000);
        }

        const applyBtnSelector = ctx.selectors.jobCards?.applyButton || 'button[data-testid="indeedApply"], button:has-text("Apply")';
        const applyBtn = ctx.page.locator(applyBtnSelector).first();

        if (await applyBtn.count() > 0) {
            await applyBtn.click({ force: true });
            await ctx.page.waitForTimeout(5000);
            yield 'modal_opened_successfully';
        } else {
            console.warn('indeed.apply', 'Apply button not found.');
            yield 'no_easy_apply_button_found';
        }
    } catch (error) {
        yield 'failed_to_click_easy_apply';
    }
}

export async function* answerQuestions(ctx: any) {
    console.log('indeed.forms', 'Processing application steps...');
    let maxSteps = 15;

    while (maxSteps > 0) {
        maxSteps--;
        await ctx.page.waitForTimeout(2000);
        const url = ctx.page.url();

        if (url.includes('post-apply') || url.includes('success')) {
            yield 'finished_answering_questions';
            return;
        }

        try {
            const resumeCard = ctx.page.locator('[data-testid="FileResumeCardHeader-title"]').first();
            if (await resumeCard.count() > 0) await resumeCard.click({ force: true }).catch(() => { });
        } catch { }

        try {
            const nextBtn = ctx.page.locator('button.ia-continueButton, button.ia-submitButton, button[type="submit"]').first();
            if (await nextBtn.count() > 0) {
                const txt = await nextBtn.innerText();
                await nextBtn.click({ force: true });
                console.log('indeed.forms', `Clicked: ${txt}`);

                if (txt.toLowerCase().includes('submit')) {
                    await ctx.page.waitForTimeout(5000);
                    yield 'finished_answering_questions';
                    return;
                }
            }
        } catch { }
    }
    yield 'error_answering_questions';
}

export async function* submitApplication(ctx: any) {
    console.log('indeed.submit', 'Finished submitting application.');
    yield 'save_applied_job';
}

export async function* externalApply(ctx: any) {
    console.warn('indeed.external', 'This job appears to be external or un-appliable by quick bots.');
    yield 'application_failed';
}

export async function* applicationFailed(ctx: any) {
    console.error('indeed.apply', 'Application flow failed or hit a roadblock.');
    yield 'application_marked_failed';
}

export async function* navigateToNextPage(ctx: any) {
    console.log('indeed.pagination', 'Proceeding to next page...');
    try {
        const nextBtnSel = ctx.selectors.pagination?.nextButton || "a[data-testid='pagination-page-next'], a[aria-label='Next Page'], a[aria-label='Next']";
        const nextBtn = ctx.page.locator(nextBtnSel).first();
        if (await nextBtn.count() > 0) {
            await nextBtn.click({ force: true });
            ctx.state.currentPage++;
            await ctx.page.waitForTimeout(5000);
            yield 'extract_job_details';
        } else {
            yield 'finish';
        }
    } catch (error) {
        yield 'finish';
    }
}

export async function* finish(ctx: any) {
    console.log('indeed.finish', `Workflow finished. Scraped total: ${ctx.state?.scrapedJobs?.length || 0}`);
    if (ctx.browser) {
        // In Camoufox we may want to keep it open based on keep_open setting, but usually we close.
        if (ctx.config?.keep_open !== true) {
            setTimeout(async () => await ctx.browser.close().catch(() => { }), 2000);
        }
    }
    yield 'done';
}

export { waitForNextConfirm } from '../core/pause_confirm';
