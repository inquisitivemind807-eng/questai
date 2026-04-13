# Migration Impact Report: Selenium (TS) to Playwright/Camoufox (Python)

This report outlines the technical scope, affected files, and architectural changes required to migrate the browser automation from Selenium (TypeScript) to Playwright/Camoufox (Python).

## 1. Core Automation Logic (The "Heavy Lift")
The following files contain the bulk of the automation logic and must be entirely rewritten in Python. They rely heavily on Selenium's `WebDriver`, `By`, and `until` APIs.

| File Path | Estimated LOC | Complexity | Description |
|-----------|---------------|------------|-------------|
| `src/bots/linkedin/linkedin_impl.ts` | ~2,800 | Very High | Main LinkedIn extraction and application workflow. |
| `src/bots/seek/seek_impl.ts` | ~2,810 | Very High | Main Seek.com.au automation logic. |
| `src/bots/seek/handlers/answer_employer_questions.ts` | ~1,200 | High | Complex form-filling logic for diverse question types. |
| `src/bots/seek/handlers/resume_handler.ts` | ~400 | Medium | File upload and resume selection logic. |
| `src/bots/seek/handlers/cover_letter_handler.ts` | ~300 | Medium | AI-driven cover letter generation and injection. |

### 1.1 File-by-File Migration Playbooks

#### LinkedIn Implementation (`linkedin_impl.ts` -> `linkedin_bot.py`)
*   **Selenium Patterns:** Heavy use of `until.elementLocated` inside retry loops for dynamic "Easy Apply" buttons; direct CDP calls for mouse movement humanization.
*   **Playwright Equivalents:** `page.locator().click()` (with built-in auto-waiting); `page.mouse.move()` with `steps` parameter for native humanization; `expect(locator).to_be_visible()`.
*   **Migration Traps:** LinkedIn's "Easy Apply" modals often refresh internally without changing the URL, which causes "StaleElement" in Selenium but requires `locator.wait_for()` in Playwright.
*   **Python Class Stub:**
```python
class LinkedInBot(BaseBot):
    async def run(self, job_url: str):
        """Main entry point for LinkedIn automation."""
        pass
    async def _handle_easy_apply(self):
        """Handles the multi-step Easy Apply modal."""
        pass
```

#### Seek Implementation (`seek_impl.ts` -> `seek_bot.py`)
*   **Selenium Patterns:** Complex `By.xpath` queries to navigate nested `div` structures; manual window handle switching for "Apply" buttons that open new tabs.
*   **Playwright Equivalents:** `page.get_by_role()` and `page.get_by_text()` for cleaner selection; `async with context.expect_page()` for seamless tab handling.
*   **Migration Traps:** Seek uses React virtualized lists for job search results; simple `find_elements` will miss off-screen items.
*   **Python Class Stub:**
```python
class SeekBot(BaseBot):
    async def extract_job_details(self, url: str) -> JobData:
        pass
    async def navigate_search_results(self):
        pass
```

#### Answer Employer Questions (`answer_employer_questions.ts` -> `question_handler.py`)
*   **Selenium Patterns:** Iterative scanning of the DOM for radio labels; `driver.executeScript` to force-check hidden inputs.
*   **Playwright Equivalents:** `page.get_by_label().check()`; `locator.dispatch_event("change")` for React-based state updates.
*   **Migration Traps:** Seek's questions are often wrapped in custom web components that hide standard HTML inputs behind Shadow DOM.
*   **Python Class Stub:**
```python
class QuestionHandler:
    async def fill_form(self, questions: List[Question]):
        """Maps AI answers to complex DOM elements."""
        pass
```

#### Resume Handler (`resume_handler.ts` -> `resume_handler.py`)
*   **Selenium Patterns:** `input.sendKeys("/path/to/pdf")` which is notoriously flakey on certain Chrome versions.
*   **Playwright Equivalents:** `locator.set_input_files(path)`; use `async with page.expect_file_chooser() as fc_info:` for complex uploads.
*   **Migration Traps:** If the site uses a drag-and-drop zone without a hidden `<input type="file">`, `set_input_files` will fail silently; developer must inject a JS `DataTransfer` object and dispatch a `drop` event via `page.evaluate()`.
*(Corrected per audit: changed filechooser event to expect_file_chooser() context manager and removed non-existent page.input_files API)*
*   **Python Class Stub:**
```python
class ResumeHandler:
    async def upload_resume(self, file_path: str):
        pass
```

#### Cover Letter Handler (`cover_letter_handler.ts` -> `cover_letter_handler.py`)
*   **Selenium Patterns:** `element.clear()` followed by `sendKeys()` which often triggers site-wide "Unsaved Changes" warnings because it doesn't fire all JS events.
*   **Playwright Equivalents:** `locator.fill("text")` which clears and types while correctly emitting input/change events.
*   **Migration Traps:** Textareas with character counters may require `page.keyboard.type()` for "true" human input emulation.
*   **Python Class Stub:**
```python
class CoverLetterHandler:
    async def inject_letter(self, content: str):
        pass
```

## 2. Architecture Diff: Selenium (TS) vs. Playwright/Camoufox (Python)

The migration involves a total shift in the execution stack. The TypeScript ecosystem (Bun) is replaced by a Python-centric stack, utilizing Camoufox for advanced stealth.

### Infrastructure Mapping

| Component | Old Stack (TypeScript) | New Stack (Python) |
|-----------|-------------------------|--------------------|
| **Runtime** | Bun / Node.js | Python 3.11+ (asyncio) |
| **Driver** | `selenium-webdriver` | `playwright` (python) |
| **Stealth** | Manual CDP / `humanization.ts` | `camoufox` (Native) |
| **HTTP Client** | `fetch` / `axios` | `httpx` (async) |
| **JSON Schema** | `zod` | `pydantic` |
| **CLI/Entry** | `bot_starter.ts` | `bot_starter.py` |

### System Diagram (Logic Flow)

```text
OLD (TypeScript/Selenium):
[Tauri Rust] -> [bun bot_starter.ts]
                      |--> [Bot Registry] --> [linkedin_impl.ts]
                      |--> [Workflow Engine] --> [YAML Steps]
                      |--> [Universal Overlay] --> [executeScript Injection]
                      |--> [Selenium WebDriver] --> [ChromeDriver] --> [Chrome]

NEW (Python/Camoufox):
[Tauri Rust] -> [python bot_starter.py (Venv)]
                      |--> [bot_registry.py] --> [linkedin_impl.py]
                      |--> [workflow_engine.py] --> [Async Steps]
                      |--> [universal_overlay.py] --> [add_init_script + evaluate]
                      |--> [Camoufox] --> [Playwright Engine] --> [Firefox/Camou]
```

## 3. Method & API Comparison Table

Common operations mapped from Selenium (TypeScript) to Playwright (Python).

| Operation | Selenium (TypeScript) | Playwright (Python) |
|-----------|-----------------------|---------------------|
| **Find Element** | `driver.findElement(By.css(".btn"))` | `page.locator(".btn")` |
| **Wait for Element** | `driver.wait(until.elementLocated(...))` | `page.wait_for_selector(".btn")` |
| **Wait for Visible** | `driver.wait(until.elementIsVisible(...))` | `await expect(locator).to_be_visible()` |
| **Click** | `await element.click()` | `await locator.click()` |
| **Type/Fill** | `await element.sendKeys("text")` | `await locator.fill("text")` |
| **Execute JS** | `driver.executeScript("return 1")` | `await page.evaluate("1")` |
| **Handle Alert** | `driver.switchTo().alert().accept()` | `page.on("dialog", lambda d: asyncio.create_task(d.accept()))` |
| **Iframe Switch** | `driver.switchTo().frame("frame_id")` | `page.frame_locator("#frame_id")` |
| **File Upload** | `input.sendKeys("/path/to/file")` | `await locator.set_input_files("/path/to/file")` |
| **Network Intercept** | N/A (requires CDP) | `await page.route("**/*", handler)` |
| **Cookies/Storage** | `driver.manage().getCookies()` | `await context.cookies()` |

*(Corrected per audit: Updated 'Wait for Visible' to include await, 'Handle Alert' to use asyncio.create_task, and 'Cookies/Storage' to context.cookies())*

## 4. Before/After Code Samples

### Element Location & Explicit Waits
**Selenium (TS):**
```typescript
const wait = new WebDriverWait(driver, 10000);
const element = await wait.until(until.elementLocated(By.xpath("//button[text()='Apply']")));
await driver.wait(until.elementIsVisible(element));
await element.click();
```
**Playwright (Python):**
```python
# Playwright uses auto-waiting, but explicit assertions are preferred for reliability
apply_btn = page.locator("xpath=//button[text()='Apply']")
await expect(apply_btn).to_be_visible(timeout=10000)
await apply_btn.click()
```

### Form Interaction & Drag-and-Drop
**Selenium (TS):**
```typescript
const source = await driver.findElement(By.id("draggable"));
const target = await driver.findElement(By.id("droppable"));
await driver.actions().dragAndDrop(source, target).perform();
```
**Playwright (Python):**
```python
await page.locator("#draggable").drag_to(page.locator("#droppable"))
```

### Navigation & Multi-Tab Handling
**Selenium (TS):**
```typescript
await driver.get("https://seek.com.au");
const originalWindow = await driver.getWindowHandle();
// ... click opens new window ...
const windows = await driver.getAllWindowHandles();
await driver.switchTo().window(windows[1]);
```
**Playwright (Python):**
```python
async with context.expect_page() as new_page_info:
    await page.locator("text=Open Details").click()
new_page = await new_page_info.value
await new_page.bring_to_front()
```

## 5. Camoufox-Specific Additions

Camoufox wraps Playwright to provide advanced anti-fingerprinting. It changes how the browser is initialized.

**Camoufox Initialization:**
```python
from camoufox.async_api import AsyncCamoufox

async with AsyncCamoufox(
    headless=False,
    geoip=True,        # Automatic proxy/IP matching
    humanize=True,     # Native human-like movement
    fingerprint_config={
        "os": ["windows", "macos"],
        "screen": {"width": 1920, "height": 1080}
    }
) as browser:
    context = await browser.new_context(storage_state="session.json")
    page = await context.new_page()
    # ... automation code ...
```
*(Corrected per audit: Changed AsyncNewBrowser to AsyncCamoufox and removed invalid browser argument)*

## 6. Session & Profile Migration

Transitioning from Selenium Chrome profiles to Playwright `storageState` JSON.

**Migration Logic (Python Utility):**
```python
import json

def convert_selenium_to_playwright(selenium_cookies):
    pw_cookies = []
    for c in selenium_cookies:
        pw_cookies.append({
            "name": c["name"],
            "value": c["value"],
            "domain": c["domain"],
            "path": c["path"],
            "expires": c.get("expiry", -1),
            "httpOnly": c.get("httpOnly", False),
            "secure": c.get("secure", False),
            "sameSite": "Lax" # Default
        })
    return {"cookies": pw_cookies, "origins": []}

# In Selenium TS: driver.manage().getCookies() -> JSON
# In Python PW: await context.add_cookies(converted_list)
```
*(Corrected per audit: Added missing await to context.add_cookies())*

## 7. Deep-Dive: Universal Overlay Injection

The `Universal Overlay` is a high-risk item. In Selenium, it used aggressive `executeScript` polling. In Playwright, we use `add_init_script` to ensure the UI persists even through hard refreshes and navigation.

**Playwright Persistence Strategy:**
```python
async def inject_overlay(page, overlay_html, overlay_js):
    # This runs BEFORE every page load, including refreshes
    await page.add_init_script(f"""
        window.__OVERLAY_HTML__ = `{overlay_html}`;
        {overlay_js}
        
        // Listen for DOMContentLoaded to initialize immediately on new navigations
        document.addEventListener('DOMContentLoaded', () => {{
            initOverlay();
            console.log('Overlay initialized on navigation');
        }});
    """)
    # Inject immediately for the current page in case it's already loaded
    await page.evaluate("initOverlay()")

# Failure Mode Mitigation:
# 1. Shadow DOM Isolation: Wrap overlay in a Shadow Root to prevent site CSS leakage.
# 2. Z-Index War: Use a high-frequency interval to reset z-index to 99999999.
```
*(Corrected per audit: Wrapped initOverlay() inside a DOMContentLoaded listener within add_init_script to ensure execution on subsequent navigations)*

## 8. Hardest Form-Filling Patterns

### Shadow DOM (Seek.com.au uses this heavily)
- **Selenium:** Required custom recursive JS functions to pierce shadow roots.
- **Playwright:** Pierces Shadow DOM by default with CSS selectors (`page.locator("my-web-component >> .internal-btn")`).

### Nested Iframes (LinkedIn/Indeed Applications)
- **Selenium:** `driver.switchTo().frame()` is stateful and prone to "StaleElementReference".
- **Playwright:** `page.frame_locator(".application-iframe").locator("#submit")` is stateless and automatically re-locates the frame if the DOM refreshes.

### Dynamic Dropdowns (Tail-end of forms)
- **Strategy:** Use `locator.select_option()` for standard `<select>` and `await locator.press_sequentially("text")` + `await page.keyboard.press("Enter")` for React/Svelte-based custom dropdowns.
*(Corrected per audit: Replaced deprecated locator.type() with locator.press_sequentially())*

## 9. Dependency & Environment Setup

### 1. Python Environment
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install playwright camoufox pyyaml httpx pydantic
python -m camoufox fetch  # CRITICAL: Replaces 'playwright install firefox'
```
*(Corrected per audit: Changed Playwright install command to Camoufox specific fetch command)*

### 2. Tauri Integration (src-tauri/src/lib.rs)
Update the `run_bot_streaming` command to point to the virtual environment:
```rust
use std::process::Stdio;

#[tauri::command]
async fn run_bot_streaming(bot_id: String) -> Result<(), String> {
    let mut child = Command::new(".venv/bin/python") // Use venv path
        .arg("src/bots/bot_starter.py")
        .arg("--bot")
        .arg(bot_id)
        .stdout(Stdio::piped()) // CRITICAL for real-time streaming
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
```
*(Corrected per audit: Added std::process::Stdio import and piped stdout/stderr for logs)*

## 10. Common Gotchas & Pitfalls

1.  **Auto-waiting vs. Reality:** Playwright waits for "actionability" (visible, stable, enabled). However, for complex Seek forms, an element might be "visible" but covered by a loading spinner. Always combine `locator.click()` with `expect()`.
2.  **Async/Sync Choice:** We MUST use the `async` Playwright API to prevent blocking the Tauri main thread and to handle multiple bot streams concurrently.
3.  **storageState limitations:** `storageState` only captures cookies and localStorage. If a site uses `sessionStorage` or IndexedDB for session tracking, manual injection logic will be needed.
4.  **CDP Sessions:** Playwright's `CDPSession` is used differently than Selenium's. It is rarely needed as most stealth is handled by Camoufox, but for low-level network modification, use `await page.context.new_cdp_session(page)`.
*(Corrected per audit: Added await to new_cdp_session())*

## 11. Scope Estimation
*   **Total Files Impacted:** ~30-40 files.
*   **Code Volume:** **8,000–10,000 lines of TypeScript** to be ported.
*   **New Python Logic:** Estimated **6,000 lines of Python** due to Playwright's more concise API.
*   **Timeline:** 4-6 weeks for a full stable migration of LinkedIn and Seek bots.

## 12. Dependency Changes
*   **Remove (package.json):** `selenium-webdriver`, `@types/selenium-webdriver`, `chromedriver`.
*   **Add (requirements.txt):**
    *   `playwright==1.40.0`
    *   `camoufox[build]==0.3.1`
    *   `httpx>=0.25.0`
    *   `pydantic>=2.0.0`
    *   `pyyaml>=6.0.0`

## 13. Migration Decisions & Rationale

| Decision | Alternatives | Rationale | Tradeoff |
|----------|--------------|-----------|----------|
| **Camoufox over Raw Playwright** | `playwright-stealth` | Camoufox provides kernel-level fingerprint spoofing and hardware-level emulation that `playwright-stealth` (JS injection) cannot match. | Requires specific Firefox binaries and is slightly heavier than raw Playwright. |
| **Firefox over Chrome** | Chrome / Edge | Camoufox is built on a hardened Firefox fork which offers superior anti-fingerprinting control. | Small rendering differences compared to the Chrome-heavy Selenium stack. |
| **Async over Sync** | `playwright.sync_api` | Essential for integration with the Tauri/Rust async event loop and handling real-time status streaming without blocking. | More complex code (await/async) and careful event loop management. |
| **httpx over requests** | `requests`, `aiohttp` | `httpx` is modern, supports HTTP/2, and has a native `async` API that perfectly matches Playwright's lifecycle. | Newer library with slightly different error handling patterns. |
| **Pydantic over Dataclasses** | Native `dataclasses` | Pydantic provides robust runtime type validation and automatic JSON serialization, critical for the Bridge API. | Minimal runtime overhead compared to native dataclasses. |
| **storageState over Profile Dirs** | `user-data-dir` | `storageState` (JSON) is portable, easier to mock, and prevents file-lock issues common with shared profile directories. | Does not capture IndexedDB or SessionStorage natively. |

## 14. Testing & Validation Strategy

### Trace Recording & Inspection
Playwright Traces are the primary debugging tool. They capture a video, DOM snapshots, and network logs for every step.
```python
# Start Tracing
await context.tracing.start(screenshots=True, snapshots=True, sources=True)

# ... Run Bot ...

# Stop and Save
await context.tracing.stop(path="trace.zip")
```
*   **Inspection:** Use `npx playwright show-trace trace.zip` to open the visual debugger.

### Network Mocking for Offline Testing
Mock external job sites to test form-filling logic without hitting rate limits.
```python
async def handle_route(route):
    await route.fulfill(status=200, body="<html>...mocked seek job...</html>")

await page.route("https://www.seek.com.au/job/**", handle_route)
```

### Migration Acceptance Criteria (Checklist)
- [ ] **Login:** Bot can detect and persist login session using `storageState`.
- [ ] **Extraction:** Scraped job data matches the JSON schema exactly.
- [ ] **Form Fill:** All radio/checkbox/text fields are populated on Seek/LinkedIn.
- [ ] **File Upload:** Resumes are successfully attached and verified as uploaded.
- [ ] **Overlay:** The Universal Overlay persists and remains interactive across 3+ navigations.
- [ ] **Stealth:** Bot passes the "Cloudflare Turnstile" and "LinkedIn Challenge" (verified via Camoufox logs).

## 15. Rollback & Coexistence Strategy

During the 4-6 week migration, both stacks will coexist. The `bot_registry` handles the dispatch logic.

### Rust Dispatcher (src-tauri/src/lib.rs)
```rust
#[tauri::command]
async fn run_bot(bot_id: String) {
    let metadata = registry::get_metadata(bot_id);
    if metadata.runtime == "python" {
        execute_py_bot(bot_id).await;
    } else {
        execute_ts_bot(bot_id).await;
    }
}
```

### Bot Registry Pattern
Each bot directory will contain a `metadata.yaml`:
```yaml
id: linkedin_v2
name: LinkedIn Bot (Python)
runtime: python
entrypoint: bots/linkedin_bot.py
legacy_v1_id: linkedin_ts
```

## 16. Known Seek & LinkedIn Site-Specific Quirks

### Seek.com.au
*   **Quirk:** Virtualized Search Results. Only ~5 jobs exist in the DOM at once.
*   **Selenium Workaround:** `driver.executeScript("window.scrollBy(0, 500)")` in a loop.
*   **Playwright Approach:** `locator.scroll_into_view_if_needed()` on the last item, then wait for the next set of items to load via `page.wait_for_function()`.

### LinkedIn
*   **Quirk:** Aggressive Rate Limiting on "Easy Apply" searches.
*   **Selenium Workaround:** `time.sleep(random.uniform(2, 5))` between every click.
*   **Playwright Approach:** `humanize=True` in Camoufox handles mouse jitter, but we still use `asyncio.sleep` with Jitter to simulate cognitive delay during form analysis.

## 17. Python Project Structure Blueprint

Proposed structure for `src/bots/core_py/`:

```text
src/bots/core_py/
├── __init__.py
├── base_bot.py           # Abstract Base Class for all bots
├── browser_manager.py    # Camoufox wrapper and profile loader
├── session_manager.py    # storageState JSON persistence logic
├── universal_overlay.py  # add_init_script injection logic
├── api_client.py         # Async HTTP client for backend communication
├── workflow_engine.py    # YAML step runner (Async version)
├── humanization.py       # Higher-level mouse/keyboard patterns
└── schemas/              # Pydantic models
    ├── job_data.py
    └── bot_config.py
```

## 18. Glossary

*   **Camoufox:** A specialized browser engine built on Firefox that spoofs hardware fingerprints (GPU, Canvas, Audio) at the source-code level rather than via JS injection.
*   **storageState:** A Playwright-specific JSON format that captures all cookies and localStorage for a session, making it easy to save/restore login states.
*   **CDP (Chrome DevTools Protocol):** A low-level protocol used to control browsers. Playwright abstracts this, but Camoufox uses it internally for stealth.
*   **Playwright Actionability:** A set of checks (visibility, stability, enablement) Playwright performs automatically before clicking or typing to ensure the interaction succeeds.
*   **frame_locator:** A stateless way to target elements inside iframes. If the iframe reloads, the locator automatically re-finds it.
*   **add_init_script:** A method to inject JavaScript into every page *before* any other scripts run. Essential for the Universal Overlay.
*   **Locator vs. ElementHandle:** Locators are "lazy" and re-evaluate on every use (prevents StaleElement), whereas ElementHandles are direct pointers to DOM nodes (avoid these).
*   **asyncio Event Loop:** The engine that runs asynchronous Python code. It allows the bot to wait for the browser without freezing the whole application.
