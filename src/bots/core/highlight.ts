/**
 * DOM Highlight Utility (Selenium)
 * ------------------------------------------------------------------
 * Visual debugging helper that draws a colored outline and glow
 * around DOM elements during bot interaction. Makes it easy to see
 * what the bot is clicking, typing into, or extracting.
 *
 * Originally inspired by the Indeed bot's Playwright highlight()
 * (`indeed_impl.ts`), adapted for Selenium's `driver.executeScript()`.
 *
 * Uses CSS `outline` (not `border`) so it never shifts layout.
 * All errors are silently swallowed — highlighting is cosmetic only.
 */

import { WebDriver, WebElement, By } from 'selenium-webdriver';

/**
 * Apply a colored outline + box-shadow glow to a Selenium WebElement.
 *
 * @param driver - Active Selenium WebDriver instance
 * @param element - The element to highlight (found via findElement)
 * @param color - CSS color string (hex, rgb, named). Default: red.
 * @param scroll - Whether to scroll the element into view. Default: true.
 */
export async function highlightElement(
  driver: WebDriver,
  element: WebElement | null,
  color: string = '#ff0000',
  scroll: boolean = true
): Promise<void> {
  if (!element) return;
  try {
    await driver.executeScript(
      `(function(el, c, doScroll) {
        if (!el) return;
        el.style.outline = '5px solid ' + c;
        el.style.outlineOffset = '-5px';
        el.style.boxShadow = '0 0 20px ' + c;
        el.style.transition = 'outline 0.1s ease-in-out';
        if (doScroll) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      })(arguments[0], arguments[1], arguments[2])`,
      element,
      color,
      scroll
    );
  } catch (_e) {
    // Highlight failures should never block the bot
  }
}

/**
 * Apply a colored outline to an element found by CSS selector.
 * Finds the first match only. If no match, silently skips.
 *
 * @param driver - Active Selenium WebDriver instance
 * @param selector - CSS selector string
 * @param color - CSS color. Default: red.
 * @param scroll - Whether to scroll into view. Default: true.
 */
export async function highlightSelector(
  driver: WebDriver,
  selector: string,
  color: string = '#ff0000',
  scroll: boolean = true
): Promise<void> {
  if (!selector) return;
  try {
    const el = await driver.findElement(By.css(selector)).catch(() => null);
    if (!el) return;
    await highlightElement(driver, el, color, scroll);
  } catch (_e) {
    // silent
  }
}

/**
 * Color palette matching the Indeed bot conventions:
 *
 *   #ff0000 — Red     — default / errors
 *   #ff4444 — Red     — wrong buttons, dismissals
 *   #ffa500 — Orange  — login / auth
 *   #ffff00 — Yellow  — dialogs, overlays, extracted fields
 *   #00ff00 — Green   — confirmations, success, selected options
 *   #00ffff — Cyan    — job cards being processed
 *   #0000ff — Blue    — action buttons (Apply, Next, Continue)
 *   #ff00ff — Magenta — title / important text anchors
 */
