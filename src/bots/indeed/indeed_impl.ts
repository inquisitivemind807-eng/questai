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
        try {
            return await this.page.evaluate(`(() => { ${script} })()`);
        } catch (e) {
            return await this.page.evaluate(script).catch(() => null);
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

        ctx.sessionExists = fs.readdirSync(sessionsDir).filter(file => !['screenshots', 'logs', 'resume', 'temp'].includes(file)).length > 0;

        try {
            const browser = await Camoufox({
                headless: ctx.config?.headless === true,
                user_data_dir: sessionsDir
            });
            ctx.browser = browser;

            // Camoufox with user_data_dir persists context, so it returns a BrowserContext.
            // If it returns a standard browser, use newPage(), if it returns context wrapper:
            const pages = await browser.pages();
            ctx.page = pages.length > 0 ? pages[0] : await browser.newPage();

            // Try to maximize window via JS
            try {
                await ctx.page.evaluate(() => window.moveTo(0, 0));
                await ctx.page.evaluate(() => window.resizeTo(screen.availWidth, screen.availHeight));
            } catch (e) { }

            ctx.overlay = new UniversalOverlay(new PlaywrightDriverAdapter(ctx.page) as any, 'Indeed');
            await ctx.overlay.initialize().catch(() => { });

            console.log('indeed.step0', `Camoufox stealth session loaded: ${sessionsDir}`);
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

        // Equivalent DOM/Cookie polling
        const cookies = await ctx.page.context().cookies();
        const isLoggedIn = cookies.some((c: any) => c.name.includes('CTK') || c.name.includes('SHOE') || c.name.includes('PassportAuthProxy'));

        if (isLoggedIn) {
            console.log('indeed.checkLogin', 'Session is authenticated.');
            yield 'login_not_needed';
        } else {
            console.log('indeed.checkLogin', 'User is not logged in.');
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
        const loginBtnSelector = ctx.selectors.auth?.loginButton || "a[href*='/auth']";
        const btn = ctx.page.locator(loginBtnSelector).first();
        if (await btn.count() > 0) {
            await btn.click({ force: true }).catch(() => { });
        }

        // Universal Banner Injection Port
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

        let authenticated = false;
        for (let i = 0; i < 60; i++) { // wait up to ~3 mins
            await ctx.page.waitForTimeout(3000);
            const cookies = await ctx.page.context().cookies();
            if (cookies.some((c: any) => c.name.includes('CTK') || c.name.includes('PassportAuthProxy') || c.name.includes('SHOE'))) {
                authenticated = true;
                break;
            }
        }

        // Clean Banner
        await ctx.page.evaluate(() => {
            const b = document.getElementById('universal-login-banner');
            if (b) b.remove();
        }).catch(() => { });

        if (authenticated) {
            console.log('indeed.login', 'Login confirmed! Proceeding...');
        } else {
            console.warn('indeed.login', 'Login timed out. Actions may fail.');
        }
        yield 'prompt_displayed_to_user';
    } catch (error) {
        console.error('indeed.login', 'Error during manual login flow', error);
        yield 'error_showing_manual_login';
    }
}

export async function* openJobsPage(ctx: any) {
    console.log('indeed.openJobs', 'Navigating to search page...');
    try {
        const keywords = ctx.config?.formData?.keywords || '';
        const location = ctx.config?.formData?.locations || '';

        let url = 'https://www.indeed.com/jobs';
        if (keywords || location) {
            url += `?q=${encodeURIComponent(keywords)}&l=${encodeURIComponent(location)}`;
        }

        await ctx.page.goto(url, { waitUntil: 'domcontentloaded' });
        await ctx.page.waitForTimeout(3000);
        ctx.overlay?.showJobProgress(0, 0, 'Navigating to Jobs...', 1).catch(() => { });
        yield 'jobs_page_loaded';
    } catch (error) {
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
                    await fetch('http://localhost:3000/api/scraped-jobs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.CORPUS_RAG_TOKEN || ''}` },
                        body: JSON.stringify({
                            platform: 'indeed', platformJobId: job.jobId,
                            title: job.title, company: job.company, url: job.url,
                            rawData: job
                        })
                    }).catch(() => { });
                    console.log(`[DEV] Extracted & Saved to DB: ${job.title} | Desc Length: ${job.description.length}`);
                } catch (e) { }
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
