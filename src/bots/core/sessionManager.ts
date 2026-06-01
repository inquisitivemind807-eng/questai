/**
 * Universal Session Manager
 * ------------------------------------------------------------------
 * Manages login-state detection across job platforms (Seek, LinkedIn,
 * Indeed). Looks for known CSS selectors, DOM indicators, and auth
 * cookies to determine whether the user is authenticated.  Provides
 * a `waitForLogin` loop and a red login banner injected into the page
 * to guide the user through manual authentication.
 *
 * Use the pre-built `SessionConfigs` map to get platform-specific
 * selectors (e.g. `SessionConfigs.linkedin`).
 */

import { WebDriver, By } from 'selenium-webdriver';

interface SessionConfig {
  /** CSS selectors for the Sign In / Log In button or link */
  signInSelectors: string[];
  /** CSS selectors that indicate a logged-in user (profile menu, avatar, etc.) */
  userMenuSelectors: string[];
  /** Substrings to look for in the page URL or title (e.g. 'dashboard', 'feed') */
  loggedInIndicators: string[];
}

/**
 * Platform-agnostic session manager.
 * Injects login banners and polls for successful manual authentication.
 */
export class UniversalSessionManager {
  private driver: WebDriver;
  private config: SessionConfig;

  constructor(driver: WebDriver, config: SessionConfig) {
    this.driver = driver;
    this.config = config;
  }

  /**
   * Check whether the user appears to be logged in.
   *
   * Strategy (in order):
   *   1. If `sessionExists` is false → assume not logged in.
   *   2. Look for user-menu selectors in the DOM.
   *   3. Check the URL and page title for logged-in indicators.
   *
   * Returns false if uncertain (default: require login).
   */
  async checkLoginStatus(sessionExists: boolean): Promise<boolean> {
    try {
      // If no session exists, definitely not logged in
      if (!sessionExists) {
        console.log('🔴 LOGIN REQUIRED: NO SESSION FOUND - PLEASE LOG IN MANUALLY');
        return false;
      }


      // Look for user account indicators (profile menu, user name, etc.)
      for (const selector of this.config.userMenuSelectors) {
        try {
          const element = await this.driver.findElement(By.css(selector));
          if (element && await element.isDisplayed()) {
            console.log('✅ LOGGED IN: User account indicators found');
            return true;
          }
        } catch {
          continue;
        }
      }

      // Check page title and URL for logged-in indicators
      const currentUrl = await this.driver.getCurrentUrl();
      const title = await this.driver.getTitle();

      for (const indicator of this.config.loggedInIndicators) {
        if (currentUrl.includes(indicator) || title.toLowerCase().includes(indicator.toLowerCase())) {
          console.log('✅ LOGGED IN: Dashboard/profile page detected');
          return true;
        }
      }

      // Default to requiring login if we can't determine status
      console.log('⚠️ LOGIN STATUS UNCERTAIN - Please verify manually');
      return false;

    } catch (error) {
      console.log(`❌ Error checking login status: ${error}`);
      return false;
    }
  }

  /**
   * Block until the user completes login manually.
   * Polls every 3 seconds for up to 5 minutes.
   * Resolves when login is detected; rejects on timeout.
   */
  async waitForLogin(): Promise<void> {
    console.log('🔴 PLEASE COMPLETE LOGIN MANUALLY');
    console.log('🔴 THE BOT WILL WAIT FOR YOU TO LOG IN...');
    console.log('=============================');

    return new Promise<void>((resolve, reject) => {
      const maxWaitTime = 5 * 60 * 1000; // 5 minutes
      const checkInterval = 3000; // 3 seconds
      let elapsed = 0;

      const checkLogin = async () => {
        try {
          if (elapsed >= maxWaitTime) {
            console.log('⏰ Login timeout reached (5 minutes). Please try again.');
            reject(new Error('Login timeout'));
            return;
          }

          // Check if login completed
          const isLoggedIn = await this.checkLoginStatus(true);
          if (isLoggedIn) {
            console.log('🟢 LOGIN DETECTED - CONTINUING...');
            resolve();
            return;
          }

          elapsed += checkInterval;
          setTimeout(checkLogin, checkInterval);
        } catch (error) {
          console.log(`❌ Error during login wait: ${error}`);
          reject(error);
        }
      };

      // Start checking
      checkLogin();
    });
  }

  /**
   * Inject a fixed-position red login banner at the top of the page.
   * Auto-removes after 30 seconds.
   *
   * @param siteName - Platform name shown in the banner (e.g. 'LinkedIn').
   */
  async showLoginBanner(siteName: string = 'this site'): Promise<void> {
    try {
      await this.driver.executeScript(`
        (function() {
          const id = 'universal-login-banner';
          if (document.getElementById(id)) return;

          const banner = document.createElement('div');
          banner.id = id;
          banner.innerHTML = '🔴 PLEASE LOG IN TO ${siteName.toUpperCase()} 🔴<br>The bot is waiting for you...';

          Object.assign(banner.style, {
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#ff4444',
            color: 'white',
            padding: '15px 20px',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 'bold',
            textAlign: 'center',
            zIndex: '999999',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            fontFamily: 'Arial, sans-serif'
          });

          document.body.appendChild(banner);

          // Remove banner after 30 seconds
          setTimeout(() => {
            try { banner.remove(); } catch(e) {}
          }, 30000);
        })();
      `);
    } catch (error) {
      console.log(`Warning: Could not show login banner: ${error}`);
    }
  }

  /** Remove the login banner from the DOM if it exists. */
  async removeLoginBanner(): Promise<void> {
    try {
      await this.driver.executeScript(`
        const banner = document.getElementById('universal-login-banner');
        if (banner) banner.remove();
      `);
    } catch {
      // Ignore errors
    }
  }
}

// Predefined configurations for different job sites
export const SessionConfigs = {
  seek: {
    signInSelectors: [
      'a[data-automation="sign in"]',
      'a[href*="login"]',
      '.sign-in',
      '[class*="signin"]'
    ],
    userMenuSelectors: [
      'a[data-automation="user menu"]',
      '[data-testid="user-menu"]',
      '.user-menu',
      'a[href*="profile"]',
      'button[aria-label*="profile"]',
      'button[aria-label*="account"]'
    ],
    loggedInIndicators: [
      'dashboard',
      'profile',
      'my seek'
    ]
  },

  linkedin: {
    signInSelectors: [
      'a[data-control-name="guest_homepage-basic_nav-header-signin"]',
      '.nav__button-secondary',
      'a[href*="login"]'
    ],
    userMenuSelectors: [
      '.global-nav__me',
      '.feed-identity-module',
      '.nav-item--profile'
    ],
    loggedInIndicators: [
      'feed',
      'mynetwork',
      'jobs/search'
    ]
  },

  indeed: {
    signInSelectors: [
      'a[data-tn-element="header-signin-link"]',
      '.gnav-SignIn',
      'a[href*="account/login"]',
      'a[href*="auth"]',
      'button:has-text("Sign in")',
      'button:has-text("Log in")'
    ],
    userMenuSelectors: [
      '.gnav-AccountMenu',
      '.np-dropdown',
      '[data-testid="gnav-AccountMenu"]',
      '.gnav-UserMenu',
      '[data-testid="user-menu"]',
      'button[aria-label*="account"]',
      'button[aria-label*="profile"]'
    ],
    loggedInIndicators: [
      'prefs',
      'account',
      'saved-jobs',
      'profile',
      'dashboard',
      'my-indeed'
    ]
  }
};