/**
 * Indeed Auto-Apply Bot
 * ---------------------
 * Automates job applications on Indeed using Camoufox.
 * 
 * Usage:
 *   - Configure your search and Chrome settings in config.yaml
 *   - Run: npm run dev
 * 
 * Author: @meteor314 
 * License: MIT
 */

import { Camoufox } from 'camoufox-js';
import { ConfigLoader } from './config';
import { IndeedLogger } from './logger';
import { 
  Page, 
  ElementHandle, 
  Cookie, 
  Logger, 
  ApplicationResult
} from './types';

export class IndeedBot {
  private configLoader: ConfigLoader;
  private logger: Logger;
  private browser: any;
  private language: string;

  constructor() {
    this.configLoader = new ConfigLoader();
    this.logger = new IndeedLogger();
    this.language = this.configLoader.getCamoufoxConfig().language;
  }

  /**
   * Initialize the browser and check authentication
   */
  private async initializeBrowser(): Promise<boolean> {
    try {
      const camoufoxConfig = this.configLoader.getCamoufoxConfig();
      const userDataDir = camoufoxConfig.user_data_dir;

      this.browser = await Camoufox({
        user_data_dir: userDataDir,
        headless: false
      });

      // When using user_data_dir, it creates a persistent context
      const page = await this.browser.newPage();

      // Navigate to Indeed homepage
      await page.goto(`https://${this.language}.indeed.com`);
      await page.waitForLoadState('domcontentloaded');

      // Check authentication
      const cookies = await page.context().cookies();
      const isAuthenticated = this.checkAuthentication(cookies);

      if (!isAuthenticated) {
        this.logger.warning('Token not found, please log in to Indeed first.');
        this.logger.warning('Redirecting to login page...');
        this.logger.warning('You need to restart the bot after logging in.');
        
        await page.goto(`https://secure.indeed.com/auth?hl=${this.language}`);
        
        // Wait for manual login (this will wait indefinitely until user logs in)
        this.logger.info('Please log in to Indeed in the browser window that opened.');
        this.logger.info('Press Ctrl+C to exit after logging in.');
        
        // Keep the browser open for manual login
        return false;
      }

      this.logger.info('Token found, proceeding with job search...');
      await page.close();
      return true;

    } catch (error) {
      this.logger.error(`Failed to initialize browser: ${error}`);
      throw error;
    }
  }

  /**
   * Check if user is authenticated by looking for Indeed auth cookies
   */
  private checkAuthentication(cookies: Cookie[]): boolean {
    const authCookieNames = [
      '__Secure-PassportAuthProxy-BearerToken',
      '__Secure-PassportAuthProxy-RefreshToken',
      'INDEED_CSRF_TOKEN',
      'PPID' // Keep old check for backward compatibility
    ];

    return cookies.some(cookie => 
      authCookieNames.some(authName => cookie.name.includes(authName))
    );
  }

  /**
   * Collect all 'Indeed Apply' job links from the current search result page
   */
  private async collectIndeedApplyLinks(page: Page, language: string): Promise<string[]> {
    const links: string[] = [];

    // Try multiple selectors for job cards as Indeed structure changes frequently
    const jobCardSelectors = [
      'div[data-testid="slider_item"]',  // Old selector
      'div[class*="job"]',               // Generic job class
      'div[data-jk]',                    // Job key attribute
      'div.job_seen_beacon',             // Alternative class
      'div[class*="JobCard"]'            // Another variation
    ];

    let jobCards: ElementHandle[] = [];
    
    for (const selector of jobCardSelectors) {
      const cards = await page.querySelectorAll(selector);
      if (cards.length > 0) {
        jobCards = cards;
        console.log(`Found ${cards.length} job cards using selector: ${selector}`);
        break;
      }
    }

    for (const card of jobCards) {
      // Try multiple selectors for Indeed Apply buttons
      const indeedApplySelectors = [
        '[data-testid="indeedApply"]',
        'button:has-text("Apply")',
        'button:has-text("Postuler")',
        '[class*="apply"]',
        'button[class*="apply"]'
      ];

      let indeedApply: ElementHandle | null = null;
      
      for (const selector of indeedApplySelectors) {
        indeedApply = await (card as any).querySelector(selector);
        if (indeedApply) {
          break;
        }
      }

      if (indeedApply) {
        // Try multiple selectors for job title links
        const linkSelectors = [
          'a.jcs-JobTitle',
          'a[data-jk]',
          'a[class*="job"]',
          'h2 a',
          'a[href*="/viewjob"]'
        ];

        let link: ElementHandle | null = null;
        
        for (const selector of linkSelectors) {
          link = await (card as any).querySelector(selector);
          if (link) {
            break;
          }
        }

        if (link) {
          const jobUrl = await link.getAttribute('href');
          if (jobUrl) {
            const fullUrl = jobUrl.startsWith('/') 
              ? `https://${language}.indeed.com${jobUrl}`
              : jobUrl;
            links.push(fullUrl);
          }
        }
      }
    }

    return links;
  }

  /**
   * Click element and wait for specified timeout
   */
  private async clickAndWait(element: ElementHandle | null, timeout: number = 5000): Promise<void> {
    if (element) {
      await element.click();
      await new Promise(resolve => setTimeout(resolve, timeout));
    }
  }

  /**
   * Apply to a specific job
   */
  private async applyToJob(jobUrl: string): Promise<ApplicationResult> {
    const page = await this.browser.newPage();
    
    try {
      await page.goto(jobUrl);
      await page.waitForLoadState('domcontentloaded');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Try to find the apply button using robust, language-agnostic selectors
      let applyBtn: ElementHandle | null = null;
      
      for (let i = 0; i < 20; i++) {
        // 1. Try button with a span with the unique Indeed Apply class
        applyBtn = await page.querySelector('button:has(span[class*="css-1ebo7dz"])');
        
        // 2. Fallback: first visible button with a span containing "Postuler" or "Apply"
        if (!applyBtn) {
          applyBtn = await page.querySelector('button:visible:has-text("Postuler")');
        }
        if (!applyBtn) {
          applyBtn = await page.querySelector('button:visible:has-text("Apply")');
        }
        
        // 3. Fallback: first visible button on the page (avoid close/cancel if possible)
        if (!applyBtn) {
          const btns = await page.querySelectorAll('button:visible');
          for (const btn of btns) {
            const label = (await btn.getAttribute('aria-label') || '').toLowerCase();
            const text = (await btn.innerText() || '').toLowerCase();
            
            if (label.includes('close') || label.includes('cancel') || 
                label.includes('fermer') || label.includes('annuler')) {
              continue;
            }
            
            if (text.includes('postuler') || text.includes('apply') || await btn.isVisible()) {
              applyBtn = btn;
              break;
            }
          }
        }
        
        if (applyBtn) {
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (applyBtn) {
        await this.clickAndWait(applyBtn, 5000);
      } else {
        this.logger.warning(`No Indeed Apply button found for ${jobUrl}`);
        await page.close();
        return { success: false, jobUrl, error: 'No apply button found' };
      }

      // Application wizard loop with timeout
      const startTime = Date.now();
      const timeout = 40000; // 40 seconds

      while (true) {
        if (Date.now() - startTime > timeout) {
          this.logger.warning(`Timeout applying to ${jobUrl}, closing tab and moving to next.`);
          break;
        }

        const currentUrl = page.url;

        // Resume step: select resume card if present
        const resumeCard = await page.querySelector('[data-testid="FileResumeCardHeader-title"]');
        if (resumeCard) {
          try {
            await resumeCard.click();
          } catch {
            const parent = await resumeCard.evaluateHandle('node => node.parentElement');
            if (parent) {
              await parent.click();
            }
          }
          await new Promise(resolve => setTimeout(resolve, 1000));

          const btns = await page.querySelectorAll('button:visible');
          let continuerBtn: ElementHandle | null = null;
          
          for (const btn of btns) {
            const text = (await btn.innerText() || '').toLowerCase();
            if (text.includes('continuer') || text.includes('continue')) {
              continuerBtn = btn;
              break;
            }
          }

          if (continuerBtn) {
            await this.clickAndWait(continuerBtn, 3000);
            continue; // go to next step
          }
        }

        // Try to find a submit button
        let submitBtn: ElementHandle | null = null;
        const btns = await page.querySelectorAll('button:visible');
        
        for (const btn of btns) {
          const text = (await btn.innerText() || '').toLowerCase();
          if (
            text.includes('déposer ma candidature') ||
            text.includes('soumettre') ||
            text.includes('submit') ||
            text.includes('apply') ||
            text.includes('bewerben') ||  // German
            text.includes('postular')     // Spanish
          ) {
            submitBtn = btn;
            break;
          }
        }

        // Fallback: last visible button (often the submit)
        if (!submitBtn && btns.length > 0) {
          submitBtn = btns[btns.length - 1];
        }

        if (submitBtn) {
          await this.clickAndWait(submitBtn, 3000);
          this.logger.info(`Applied successfully to ${jobUrl}`);
          break;
        }

        // Fallback: try to find a visible and enabled button to continue
        const btn = await page.querySelector(
          'button[type="button"]:not([aria-disabled="true"]), button[type="submit"]:not([aria-disabled="true"])'
        );
        
        if (btn) {
          await this.clickAndWait(btn, 3000);
          if (page.url.includes('confirmation') || page.url.includes('submitted')) {
            this.logger.info(`Applied successfully to ${jobUrl}`);
            break;
          }
        } else {
          this.logger.warning(`No continue/submit button found at ${currentUrl}`);
          break;
        }
      }

      await page.close();
      return { success: true, jobUrl };

    } catch (error) {
      this.logger.error(`Error applying to ${jobUrl}: ${error}`);
      await page.close();
      return { success: false, jobUrl, error: String(error) };
    }
  }

  /**
   * Generate search URLs based on pagination
   */
  private generateSearchUrls(): string[] {
    const searchConfig = this.configLoader.getSearchConfig();
    const { base_url, start, end } = searchConfig;
    const urls: string[] = [];

    for (let i = start; i <= end; i += 10) {
      const url = `${base_url}&start=${i}`;
      urls.push(url);
    }

    return urls;
  }

  /**
   * Main execution method
   */
  async run(): Promise<void> {
    try {
      const isAuthenticated = await this.initializeBrowser();
      
      if (!isAuthenticated) {
        return;
      }

      const searchUrls = this.generateSearchUrls();
      const allJobLinks: string[] = [];

      // Collect job links from all search pages
      for (const url of searchUrls) {
        try {
          console.log(`Visiting URL: ${url}`);
          const page = await this.browser.newPage();
          await page.goto(url, { timeout: 30000 });
          await page.waitForLoadState('domcontentloaded');
          
          console.log('Waiting for page to load, if any cloudflare protection button appears... please click it.');
          await new Promise(resolve => setTimeout(resolve, 10000));

          const links = await this.collectIndeedApplyLinks(page, this.language);
          allJobLinks.push(...links);
          console.log(`Found ${links.length} Indeed Apply jobs on this page.`);
          
          await page.close();
          await new Promise(resolve => setTimeout(resolve, 5000));

        } catch (error) {
          console.log(`Error processing URL ${url}: ${error}`);
          continue;
        }
      }

      console.log(`Total Indeed Apply jobs found: ${allJobLinks.length}`);

      // Apply to all collected jobs
      for (const jobUrl of allJobLinks) {
        console.log(`Applying to: ${jobUrl}`);
        const result = await this.applyToJob(jobUrl);
        
        if (!result.success) {
          this.logger.error(`Failed to apply to ${jobUrl}: ${result.error}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

    } catch (error) {
      this.logger.error(`Bot execution failed: ${error}`);
      throw error;
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }
}

// Main execution
async function main() {
  const bot = new IndeedBot();
  await bot.run();
}

// Run the bot if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

// Export removed to avoid duplicate export error
