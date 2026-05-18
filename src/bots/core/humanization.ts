/**
 * Human Behavior Simulation & Stealth Features
 * ------------------------------------------------------------------
 * Makes Selenium WebDriver interactions look convincingly human to
 * avoid bot detection. Provides:
 *
 * - Randomized click delays between actions
 * - Character-by-character typing at variable speed
 * - Smooth scrolling with pauses
 * - Random mouse movements
 * - Simulated reading & thinking pauses based on content length
 * - Stealth browser property overrides (navigator.webdriver, plugins, etc.)
 *
 * Used by LinkedIn and Seek bots (Selenium/Chrome).
 * Indeed uses Camoufox (Playwright), which has its own humanization.
 */

import { WebDriver, WebElement } from 'selenium-webdriver';
import { Actions } from 'selenium-webdriver/lib/input';

/** Configuration for human-like interaction timing and behavior. */
export interface HumanizationConfig {
  /** Min/max range (ms) for delays between clicks */
  clickDelay: {
    min: number;
    max: number;
  };
  /** Min/max range (ms) for delay between each keystroke during typing */
  typingSpeed: {
    min: number;
    max: number;
  };
  /** Milliseconds per scroll step */
  scrollSpeed: number;
  /** If true, simulate mouse movement before clicks */
  mouseMovement: boolean;
  /** If true, add random pauses between actions */
  randomPauses: boolean;
}

/**
 * Default humanization profile — moderate speed, full simulation.
 * Good balance between speed and stealth for most job platforms.
 */
export const DEFAULT_HUMANIZATION: HumanizationConfig = {
  clickDelay: { min: 500, max: 1500 },
  typingSpeed: { min: 50, max: 150 },
  scrollSpeed: 300,
  mouseMovement: true,
  randomPauses: true
};

export class HumanBehavior {
  private config: HumanizationConfig;

  /** @param config - Customization config; defaults to DEFAULT_HUMANIZATION */
  constructor(config: HumanizationConfig = DEFAULT_HUMANIZATION) {
    this.config = config;
  }

  /**
   * Wait a random amount of time between `min` and `max` milliseconds.
   * Falls back to `clickDelay` defaults if no range is provided.
   */
  async randomDelay(min?: number, max?: number): Promise<void> {
    const minDelay = min || this.config.clickDelay.min;
    const maxDelay = max || this.config.clickDelay.max;
    const delay = Math.random() * (maxDelay - minDelay) + minDelay;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Click an element in a human-like way:
   * 1. Scroll element into view smoothly (if mouseMovement is on).
   * 2. Add a small pre-click delay (100–300ms).
   * 3. Click.
   * 4. Add a small post-click delay (200–600ms).
   */
  async humanClick(driver: WebDriver, element: WebElement): Promise<void> {
    if (this.config.mouseMovement) {
      // Scroll element into view first
      await driver.executeScript("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", element);
      await this.randomDelay(200, 500);
    }

    // Small random delay before clicking
    await this.randomDelay(100, 300);

    // Perform the click
    await element.click();

    // Small delay after clicking
    await this.randomDelay(200, 600);
  }

  /**
   * Type text one character at a time with random per-keystroke delays.
   * If `randomPauses` is off, types instantly via sendKeys.
   */
  async humanType(element: WebElement, text: string): Promise<void> {
    await element.clear();

    if (!this.config.randomPauses) {
      await element.sendKeys(text);
      return;
    }

    // Type character by character with random delays
    for (const char of text) {
      await element.sendKeys(char);
      const delay = Math.random() * (this.config.typingSpeed.max - this.config.typingSpeed.min) + this.config.typingSpeed.min;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  /**
   * Scroll the page smoothly up or down by `pixels`.
   * Uses `window.scrollBy({ behavior: 'smooth' })` and pauses after.
   */
  async smoothScroll(driver: WebDriver, direction: 'up' | 'down', pixels: number = 300): Promise<void> {
    const scrollDirection = direction === 'down' ? pixels : -pixels;

    await driver.executeScript(`
      window.scrollBy({
        top: ${scrollDirection},
        behavior: 'smooth'
      });
    `);

    await this.randomDelay(500, 1000);
  }

  /**
   * Move the mouse to a random nearby position (if mouseMovement is on).
   * Simulates idle cursor drift that real users do.
   */
  async randomMouseMovement(driver: WebDriver): Promise<void> {
    if (!this.config.mouseMovement) return;

    const actions = driver.actions();

    // Move to a random position
    const x = Math.floor(Math.random() * 100) - 50;
    const y = Math.floor(Math.random() * 100) - 50;

    await actions.move({ x, y }).perform();
    await this.randomDelay(100, 300);
  }

  /**
   * Simulate reading time based on the length of content.
   * Estimates ~200 words per minute, ~5 chars per word.
   * Capped at 5 seconds to keep the bot moving.
   *
   * @param contentLength - Character count of the text being "read".
   */
  async readingPause(contentLength: number): Promise<void> {
    if (!this.config.randomPauses) return;

    // Estimate reading time: ~200 words per minute, ~5 chars per word
    const wordsEstimate = contentLength / 5;
    const readingTimeMs = (wordsEstimate / 200) * 60 * 1000;

    // Add some randomness (50% to 150% of estimated time)
    const randomFactor = 0.5 + Math.random();
    const actualDelay = Math.min(readingTimeMs * randomFactor, 5000); // Cap at 5 seconds

    await new Promise(resolve => setTimeout(resolve, actualDelay));
  }

  /**
   * Simulate a human thinking for 1–3 seconds (if randomPauses is on).
   * Used before filling form fields to mimic decision time.
   */
  async thinkingPause(): Promise<void> {
    if (!this.config.randomPauses) return;
    await this.randomDelay(1000, 3000);
  }

  /**
   * Check if an element is both visible (CSS) and inside the current viewport.
   * Returns false on any error (element gone stale, etc.).
   */
  async isElementVisible(driver: WebDriver, element: WebElement): Promise<boolean> {
    try {
      const isVisible = await driver.executeScript(`
        const elem = arguments[0];
        const rect = elem.getBoundingClientRect();
        return (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
          elem.offsetParent !== null
        );
      `, element);

      return Boolean(isVisible);
    } catch {
      return false;
    }
  }

  /**
   * Fill a form field with human-like behavior:
   * 1. Click the field (with mouse movement).
   * 2. Pause to "think".
   * 3. Type the value one character at a time.
   * 4. Brief post-fill pause.
   *
   * @param label - Optional label logged to console for debugging.
   */
  async fillFormField(driver: WebDriver, element: WebElement, value: string, label?: string): Promise<void> {
    if (label) {
      console.log(`[Human] Filling field: ${label}`);
    }

    // Simulate looking at the field
    await this.humanClick(driver, element);
    await this.thinkingPause();

    // Type the value
    await this.humanType(element, value);

    // Brief pause after filling
    await this.randomDelay(300, 800);
  }
}

/**
 * Static stealth utilities to hide Selenium/Chrome automation markers.
 * Overrides `navigator.webdriver`, `navigator.plugins`, and `navigator.languages`
 * so anti-bot scripts see a normal browser fingerprint.
 */
export class StealthFeatures {
  /**
   * Override browser JS properties that leak automation:
   * - navigator.webdriver → undefined
   * - navigator.plugins → [1,2,3,4,5] (non-empty array)
   * - navigator.languages → ['en-US', 'en']
   */
  static async hideWebDriver(driver: WebDriver): Promise<void> {
    // Hide webdriver property
    await driver.executeScript(`
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    `);

    // Override plugins
    await driver.executeScript(`
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
    `);

    // Override languages
    await driver.executeScript(`
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    `);
  }

  /**
   * Randomize `navigator.userAgent` to one of several recent Chrome versions.
   * Helps avoid fingerprinting based on a static or default UA string.
   */
  static async randomizeUserAgent(driver: WebDriver): Promise<void> {
    const userAgents = [
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    ];

    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

    await driver.executeScript(`
      Object.defineProperty(navigator, 'userAgent', {
        get: () => '${randomUA}',
      });
    `);
  }
}