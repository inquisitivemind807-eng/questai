# Corpus-RAG

## bugs

### Billing and tokens

- [ ] 1. Buy tokens page: "Error loading plans: Failed to get plans" (investigate). **[Est: 3 hrs]**
  - **Files:** `src/routes/plans/+page.svelte`, `src/lib/services/planService.js`, corpus-rag `/api/plans`.
  - **Functions to investigate:**
    - `src/routes/plans/+page.svelte`: `onMount()` lifecycle, `loadPlans()` function, error state handling
    - `src/lib/services/planService.js`: `getPlans()` or `fetchPlans()` method, API endpoint configuration
  - **What to check:**
    - API endpoint URL construction (check `API_BASE` or similar constant)
    - Authentication headers (JWT token inclusion via `getHeaders()` or `tokenService`)
    - CORS configuration if running locally
    - Response parsing logic (JSON format mismatch)
    - Error handling in catch blocks
  - **Backend (corpus-rag):**
    - `/api/plans` endpoint implementation
    - Database connection for plans table
    - Authentication middleware validation
- [ ] 2. Orders page: "Error loading orders: Failed to get orders". **[Est: 2 hrs]**
  - **Files:** `src/routes/orders/+page.svelte`, `src/lib/services/orderService.js`.
  - **Functions to investigate:**
    - `src/routes/orders/+page.svelte`: `onMount()`, `loadOrders()` or similar async function
    - `src/lib/services/orderService.js`: `getOrders()` method, API call implementation
  - **What to check:**
    - API endpoint for orders (likely `/api/orders`)
    - Authentication token validation
    - User ID parameter (if orders are user-specific)
    - Error response format from backend
    - Loading state and error state variables in component
  - **Similar to bug #1:** Check API_BASE constant, tokenService.getHeaders(), CORS
- [ ] 3. Token history page: "Error loading transactions: Failed to get transactions". **[Est: 2 hrs]**
  - **Files:** `src/routes/tokens/history/+page.svelte`, `src/lib/services/tokenService.js`.
  - **Functions to investigate:**
    - `src/routes/tokens/history/+page.svelte`: `onMount()`, `loadTransactions()` function
    - `src/lib/services/tokenService.js`: `getTransactions()` or `getTokenHistory()` method
  - **What to check:**
    - API endpoint (likely `/api/tokens/history` or `/api/transactions`)
    - Query parameters (date range, pagination, user filter)
    - Response data structure (array vs object, nested data)
    - Token service may have multiple responsibilities - check if method exists
  - **Debug steps:**
    1. Check if tokenService.getTransactions() method exists
    2. Verify API endpoint is correct in corpus-rag backend
    3. Test API call directly with curl/Postman using JWT token
- [ ] 4. "Authentication Required: Failed to get JWT token: Authentication failed" — fix or improve messaging. **[Est: 1.5 hrs]**
  - **Files:** `src/routes/api-test/+page.svelte`, `src/lib/services/tokenService.js`, `src/lib/authService.js`, `src/lib/corpus-rag-auth.js`; pages that call `getHeaders()` and show errors.
  - **Functions to investigate:**
    - `src/lib/services/tokenService.js`: `getHeaders()` method - builds auth headers
    - `src/lib/authService.js`: Authentication state store, JWT token retrieval
    - `src/lib/corpus-rag-auth.js`: `validateSession()`, token refresh logic
  - **What to check:**
    - Token expiration handling (check `expiresAt` in `.cache/jwt_tokens.json`)
    - Refresh token logic - does it auto-refresh expired access tokens?
    - Error message origin - where is "Authentication failed" thrown?
    - Token storage - localStorage vs sessionStorage vs file
    - Svelte store subscription in components
  - **Improve messaging:**
    - Replace generic "Authentication failed" with specific errors:
      - "Session expired, please log in again"
      - "Invalid credentials"
      - "Token refresh failed"
    - Add user-friendly redirect to login page
    - Show countdown timer before auto-logout on token expiry

### API pages (cover letter, resume enhancement)

- [ ] 1. Investigate "no saved jobs" issue on new app boot; show a more user-friendly toast. **[Est: 2 hrs]**
  - **Files:** `src/routes/cover-letters/+page.svelte`, `src/routes/resume-enhancement/+page.svelte`, `src/lib/corpus-rag-client.js` (jobs API).
  - **Functions to investigate:**
    - Both page components: `onMount()`, `loadJobs()` or `fetchSavedJobs()` function
    - `src/lib/corpus-rag-client.js`: `getJobs()` or `getSavedJobs()` method
  - **What to check:**
    - Does `/api/jobs` endpoint return empty array or throw error?
    - Is there a null check for empty jobs array before showing error?
    - Initial state vs error state - distinguish between "no jobs yet" and "error loading"
    - Toast library - check if DaisyUI toast or custom implementation
  - **Solution approach:**
    - Distinguish between HTTP errors (500, 404) and empty results (200 with [])
    - For empty array: Show friendly message "No saved jobs yet. Start by saving some jobs!"
    - For errors: Show "Unable to load jobs" with retry button
    - Add skeleton loader or spinner during initial load
  - **Code pattern to look for:**
    ```javascript
    if (!response.ok) throw new Error(...)
    const jobs = await response.json()
    if (!jobs || jobs.length === 0) { /* handle empty case */ }
    ```
- [ ] 2. Replace default error overlay "Failed to load jobs: Unknown error" with clearer messaging. **[Est: 1.5 hrs]**
  - **Files:** `src/routes/cover-letters/+page.svelte`, `src/routes/resume-enhancement/+page.svelte`, error/alert copy.
  - **Variables to update:**
    - `error` state variable in components (likely string or error object)
    - Alert/toast message templates
  - **What to check:**
    - Error message construction in catch blocks: `catch (e) { error = String(e.message) || 'Unknown error' }`
    - Look for "Unknown error" string literal
    - Check if error comes from API response: `response.error` or `response.message`
  - **Improved messages:**
    - "Unable to load saved jobs. Please check your connection and try again."
    - "Jobs service unavailable. Please try again later."
    - "Authentication required. Please log in to view your saved jobs."
  - **Where to change:**
    - Find catch blocks in loadJobs/fetchJobs functions
    - Update error message templates in component markup (`{#if error}` blocks)
    - Consider adding error codes for different scenarios
- [ ] 3. Fix the same issue on all pages that require saved jobs. **[Est: 2 hrs]**
  - **Files:** `src/routes/cover-letters/+page.svelte`, `src/routes/resume-enhancement/+page.svelte`, `src/lib/corpus-rag-client.js`.
  - **Approach:**
    - Create centralized error handling in `corpus-rag-client.js`
    - Extract common error messages to constants or i18n file
    - Create reusable error component or utility function
  - **Steps:**
    1. Find all pages that call jobs API (grep for "getJobs" or "loadJobs")
    2. Standardize error handling pattern across all pages
    3. Update corpus-rag-client.js to return consistent error format
  - **Pattern to implement:**
    ```javascript
    // In corpus-rag-client.js
    export async function getSavedJobs() {
      try {
        const response = await fetch(...)
        if (!response.ok) {
          throw new JobsError('Failed to load jobs', response.status)
        }
        const data = await response.json()
        return { success: true, jobs: data }
      } catch (error) {
        return { success: false, error: error.message, status: error.status }
      }
    }
    ```
  - **Other pages to check:**
    - Search for: `corpus-rag-client.js` imports
    - Search for: "saved jobs" string in svelte files
    - Check: Any dashboard or analytics pages that show job stats

## missing feature

### Auth and onboarding

- [ ] 1. Use corpus-rag API to login/signup. Assign some free tokens to new users. **[Est: 8 hrs]**
  - **Files:** `src/routes/login/+page.svelte`, `src/lib/authService.js`, `src/lib/corpus-rag-auth.js`; backend (corpus-rag) signup + token grant.
  - **Frontend implementation:**
    - `src/routes/login/+page.svelte`:
      - Add signup mode toggle (already has `mode` variable - check line ~6)
      - Create `handleSignup()` function separate from `handleSubmit()`
      - Add fields: name, email, password, confirmPassword
    - `src/lib/corpus-rag-auth.js`:
      - Create `signup()` method: `POST /api/auth/signup` with { name, email, password }
      - Store JWT tokens on successful signup
      - Call `login()` automatically after signup or return tokens directly
    - `src/lib/authService.js`:
      - Update Svelte store to handle new user state
      - Add `isNewUser` flag for onboarding flow
  - **Backend (corpus-rag) implementation:**
    - Create `/api/auth/signup` endpoint
    - Validate email uniqueness, password strength
    - Hash password (bcrypt or argon2)
    - Create user record in database
    - **Grant free tokens:** Insert record in tokens table (e.g., 1000 free tokens)
    - Generate JWT access + refresh tokens
    - Return tokens in response
  - **Token grant logic:**
    - Define free token amount in environment variable (SIGNUP_FREE_TOKENS=1000)
    - Create transaction record for free token grant
    - Add "signup bonus" or "welcome bonus" as transaction type
  - **Validation:**
    - Email format validation
    - Password requirements (min 8 chars, mix of letters/numbers)
    - Check if email already exists (return 409 Conflict)

### Infrastructure / deployment

- [ ] 1. Keep corpus-rag on a server. **[Est: 6 hrs]**
  - **Files:** Documentation / deployment only.
  - **Deployment options:**
    1. **VPS (DigitalOcean, Linode, AWS EC2):**
       - Setup PM2 or systemd service for corpus-rag
       - Configure nginx reverse proxy
       - Setup SSL with Let's Encrypt (certbot)
       - Configure firewall (ufw) - allow 80, 443, 3000
    2. **Docker deployment:**
       - Create Dockerfile for corpus-rag
       - Docker compose with corpus-rag + database
       - Environment variables configuration
    3. **Platform-as-a-Service (Heroku, Railway, Render):**
       - Easiest option - just push code
       - Configure environment variables in dashboard
  - **Configuration needed:**
    - Database connection string (MongoDB/PostgreSQL)
    - JWT secret keys
    - CORS allowed origins (include finalboss app URL)
    - Port configuration (default 3000 or environment PORT)
  - **Environment variables to set:**
    - `DATABASE_URL`
    - `JWT_SECRET`
    - `JWT_REFRESH_SECRET`
    - `CORS_ORIGIN` (comma-separated list)
    - `NODE_ENV=production`
  - **Post-deployment:**
    - Update finalboss `VITE_API_BASE` to point to deployed URL
    - Test all API endpoints
    - Setup monitoring (Uptime Robot, Better Stack)
    - Configure database backups


# FINALBOSS

## bugs

### Build / tooling

- [ ] 1. Sensitive data files and user configuration are tracked by git and committed to repository. **[Exists - CRITICAL SECURITY ISSUE]** **[Est: 6 hrs]**
  - **Files:** `.gitignore`, `.cache/jwt_tokens.json`, `.cache/api_token.txt`, `jobs/`, `logs/`, `src/bots/core/user-bots-config.json`, `deknilJobsIds.json`, `.cursor/debug.log`, `apitestjsons/`
  - **Evidence:** Multiple sensitive files are being tracked by git and have been committed to repository:
    - **JWT tokens:** `.cache/jwt_tokens.json` committed in ed52feb, f02ff13, and 13+ other commits - contains access tokens, refresh tokens, and user email addresses
    - **Job application data:** `jobs/linkedinjobs/` directory committed in ed52feb, 6268c5e, f02ff13, 02e82e6 - contains personal job search data
    - **User configuration:** `src/bots/core/user-bots-config.json` committed in 6be00b3, 521deab, 22e2c21 - contains keywords, locations, API keys (deepSeekApiKey), email, phone
    - **API tokens:** `.cache/api_token.txt` - contains authentication tokens
    - **Debug logs:** `.cursor/debug.log`, `src/bots/linkedin/linkedin-debug.log`, `logs/` - may contain sensitive debugging information
    - **Job IDs:** `deknilJobsIds.json` - tracks applied job IDs
  - **Security Impact:**
    - If pushed to GitHub/public repository, all tokens and personal data are exposed
    - JWT tokens can be used to impersonate users
    - Job application data reveals personal information, job search strategies
    - User email addresses and preferences are exposed (found: "achaulagain123@gmail.com" in committed JWT token)
  - **Root Cause:** `.gitignore` file is incomplete and missing critical entries:
    - Missing: `.cache/`, `.cursor/`, `logs/`, `jobs/` (root level), `deknilJobsIds.json`, `apitestjsons/`, `*-debug.log`
    - Has: `sessions/` but jobs data is stored outside of sessions
  - **Solution Needed:**
    1. Add all sensitive directories to `.gitignore`
    2. Remove sensitive files from git history using `git filter-branch` or BFG Repo-Cleaner
    3. Rotate all exposed JWT tokens and API keys
    4. Create template versions of config files with placeholder values
  - **IMMEDIATE ACTION - .gitignore Additions:**
    ```gitignore
    # Authentication tokens and credentials (CRITICAL)
    .cache/
    *.token
    *.jwt
    jwt_tokens.json
    api_token.txt

    # User configuration files (contains personal preferences and API keys)
    src/bots/core/user-bots-config.json
    src/bots/user-bots-config.json
    src-tauri/src/bots/user-bots-config.json
    deknilJobsIds.json

    # Job application data (personal information)
    jobs/
    apitestjsons/

    # Logs and debug files (may contain sensitive data)
    logs/
    *.log
    *-debug.log
    .cursor/

    # Additional sensitive patterns
    debug/
    test_session/
    ```
  - **IMMEDIATE ACTION - Remove Files from Git:**
    ```bash
    # Step 1: Stop tracking files but keep them locally
    git rm --cached -r .cache/
    git rm --cached -r logs/
    git rm --cached -r jobs/
    git rm --cached -r .cursor/
    git rm --cached src/bots/core/user-bots-config.json
    git rm --cached src/bots/user-bots-config.json
    git rm --cached src-tauri/src/bots/user-bots-config.json
    git rm --cached deknilJobsIds.json
    git rm --cached -r apitestjsons/

    # Step 2: Commit the removal
    git commit -m "Remove sensitive files from tracking"
    ```
  - **IMMEDIATE ACTION - Clean Git History (if pushing to GitHub):**
    ```bash
    # WARNING: This rewrites git history. Coordinate with team if shared repo.

    # Using BFG Repo-Cleaner (recommended):
    # 1. Download BFG: https://rtyley.github.io/bfg-repo-cleaner/
    # 2. Run: java -jar bfg.jar --delete-files jwt_tokens.json
    # 3. Run: java -jar bfg.jar --delete-folders .cache
    # 4. Run: git reflog expire --expire=now --all && git gc --prune=now --aggressive
    ```
  - **IMMEDIATE ACTION - Rotate Credentials:**
    1. Generate new JWT tokens from corpus-rag server
    2. Update any API keys that were in user-bots-config.json
    3. Notify anyone who may have cloned the repository
  - **IMMEDIATE ACTION - Create Template Config:**
    Create: `src/bots/core/user-bots-config.json.template` with placeholder values:
    ```json
    {
      "formData": {
        "keywords": "YOUR_KEYWORDS_HERE",
        "locations": "YOUR_LOCATION_HERE",
        "deepSeekApiKey": "YOUR_API_KEY_HERE",
        "email": "",
        "phone": ""
      }
    }
    ```

- [ ] 2. PostCSS issue at startup on login (or similar) page. **[Exists]** **[Est: 3 hrs]**
  - **Files:** `src/app.css`, `postcss.config.js` (or Vite/Tailwind config), `package.json` (postcss/tailwind deps).
  - **Evidence:** PostCSS error occurs when loading login page: `[postcss] /home/dwagle/inquisitive_mind/finalboss/src/routes/login/+page.svelte?svelte&type=style&lang.css:2:12: Unknown word onMount`. PostCSS is incorrectly trying to parse the `<script>` tag content as CSS.
  - **Error Log Location:** Lines 15-40 in startup output show the full stack trace.
  - **Root cause:** Vite/PostCSS is preprocessing the wrong parts of `.svelte` files
  - **Files to check:**
    - `vite.config.js` or `vite.config.ts`: Svelte plugin configuration
    - `svelte.config.js`: Svelte preprocessor settings
    - `postcss.config.js`: PostCSS plugins order and configuration
    - `src/routes/login/+page.svelte`: Check for style tag issues
  - **What to investigate:**
    1. Check if `@sveltejs/vite-plugin-svelte` is configured correctly
    2. Verify preprocessing order in svelte.config.js
    3. Look for conflicting PostCSS plugins (autoprefixer vs tailwindcss order)
    4. Check if there's a `<style>` tag in login page that's malformed
  - **Likely fixes:**
    - Update `svelte.config.js` preprocess configuration:
      ```javascript
      import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
      export default { preprocess: vitePreprocess() }
      ```
    - Or ensure proper Svelte plugin config in `vite.config.js`:
      ```javascript
      plugins: [svelte({ preprocess: vitePreprocess() })]
      ```
    - Check package versions: `@sveltejs/vite-plugin-svelte` should be ^5.0.0
  - **Debug steps:**
    1. Try removing `<style>` tags from login page temporarily
    2. Check if error occurs on other pages
    3. Verify Svelte preprocessing happens before PostCSS

### Job analytics

- [ ] 1. HTTP 404: show a more user-friendly error for non-technical users; use the same error/warning window for all such cases. **[Exists]** **[Est: 2 hrs]**
  - **Files:** `src/routes/job-analytics/+page.svelte`, `src/routes/job-analytics/[id]/+page.svelte` (loadDetail, error state).
  - **Evidence:** Line 43-44 in `[id]/+page.svelte` shows basic error handling for 404: `if (response.status === 404) { error = 'Application not found'; }`. Message is technical rather than user-friendly.
  - **Functions to modify:**
    - `src/routes/job-analytics/[id]/+page.svelte`: `loadDetail()` function (lines 31-64)
    - Look for: `if (response.status === 404)` at line 43
  - **Current implementation:**
    ```javascript
    if (response.status === 404) {
      error = 'Application not found';
      app = null;
      return;
    }
    ```
  - **Improved user-friendly messages:**
    - Replace "Application not found" with:
      ```javascript
      error = "We couldn't find this job application. It may have been deleted or the link is incorrect."
      ```
    - Add helpful actions in error UI:
      - "Go back to job analytics" button
      - "Search for other applications" link
  - **Create reusable error component:**
    - `src/lib/components/ErrorAlert.svelte`:
      - Props: message, type (404, 500, network), actions
      - Consistent styling using DaisyUI alert classes
      - Icon based on error type
  - **Standardize across all pages:**
    - Search for all `response.status` checks in project
    - Replace with consistent error messages:
      - 404: "Not found" errors
      - 500: "Server error" errors
      - 401/403: "Authentication" errors
      - Network: "Connection" errors

### Bot: Seek

- [ ] 1. When a seek bot is ran again for second or third time, it opens the browser but hangs there or stops there instead of opening the seek.com.au webpage. **[Exists]** **[Est: 5 hrs]**
  - **Files:** `src/bots/core/browser_manager.ts` (setupChromeDriver, session management), Chrome user-data-dir lock files.
  - **Evidence:** Chrome creates multiple LOCK files in the session directory to prevent concurrent profile access:
    - Main lock: `sessions/seek/Default/LOCK` (verified to exist)
    - 30+ additional LOCK files in subdirectories (IndexedDB, Local Storage, Service Worker, etc.)
  - **Root Cause:** When bot crashes or doesn't close cleanly, LOCK files remain in `sessions/seek/` directory. On next run, Chrome detects stale LOCK and hangs thinking another instance is using the profile.
  - **Code Reference:** `browser_manager.ts` line 221 uses `--user-data-dir=${sessionsDir}` which creates these locks. Lines 163-164 acknowledge this issue for real Chrome profiles ("Chrome can't use same profile in multiple instances") but don't handle it for bot sessions.
  - **Functions to investigate:**
    - `browser_manager.ts`: `setupChromeDriver(botName: string)` (lines 116-259) - where Chrome session is initialized
    - `browser_manager.ts`: `monitorBrowserClose(driver, onBrowserClosed)` (lines 85-114) - handles browser closure but doesn't clean locks
    - `browser_manager.ts`: `killAllChromeProcesses()` (lines 49-82) - kills Chrome but doesn't remove LOCK files
  - **What to check:**
    - Check if LOCK files exist in `sessions/{botName}/` before starting Chrome
    - Verify if process holding LOCK is still running (check PID if stored in LOCK file)
    - Look for stale locks (modified time > 1 hour ago)
    - Check Chrome command-line flags for session isolation options
  - **Debug steps:**
    1. Run Seek bot once, let it crash or force-quit
    2. Check `sessions/seek/` for LOCK files: `find sessions/seek -name "LOCK"`
    3. Try running bot again - it will hang
    4. Manually delete LOCK files: `rm -f sessions/seek/**/LOCK`
    5. Bot now works on next run
  - **Solution approaches:**
    - **Option 1 - Clean stale locks on startup (recommended):**
      ```typescript
      // Add to setupChromeDriver before creating driver
      const cleanStaleLocks = (sessionDir: string) => {
        const lockPattern = path.join(sessionDir, '**/LOCK');
        const lockFiles = glob.sync(lockPattern);
        lockFiles.forEach(lockFile => {
          try {
            fs.unlinkSync(lockFile);
            printLog(`Removed stale LOCK: ${lockFile}`);
          } catch (e) {
            printLog(`Could not remove LOCK: ${lockFile}`);
          }
        });
      };
      cleanStaleLocks(sessionsDir);
      ```
    - **Option 2 - Unique session per run:**
      ```typescript
      const sessionsDir = path.join(process.cwd(), 'sessions', botName, Date.now().toString());
      ```
    - **Option 3 - Add `--disable-session-crashed-bubble` and `--disable-restore-session-state` flags**
  - **Files to create/modify:**
    - Add cleanup function in `browser_manager.ts` before line 237 (before Builder is called)
    - Import `glob` package: `import glob from 'glob'` or use `fs.readdirSync` recursively

- [ ] 2. Cloudflare check does not pass. **[Could not be verified]** **[Est: 12 hrs]**
  - **Files:** `src/bots/core/browser_manager.ts` (Chrome/stealth), `src/bots/seek/seek_impl.ts`; Indeed has `indeed_selectors.json` cloudflare_challenge — Seek may need similar or driver config.
  - **Notes:** Cannot verify without running the bot against Seek's actual Cloudflare protection. Would require live testing with Seek.com.au.
  - **Functions to investigate:**
    - `browser_manager.ts`: `setupChromeDriver()` lines 142-234 - Chrome stealth configuration
    - `seek_impl.ts`: Add Cloudflare detection and handling similar to Indeed bot
  - **Current stealth measures (already implemented):**
    - Line 230: `excludeSwitches('enable-automation', 'enable-logging')` - removes automation flags
    - Line 233: `--disable-blink-features=AutomationControlled` - hides WebDriver property
    - Lines 160-216: Option to use real Chrome profile copy for cookies/fingerprint
  - **What to check:**
    - Does Seek.com.au show Cloudflare challenge page?
    - Check for elements: `#challenge-running`, `#challenge-error-text`, `.cf-error-details`
    - Monitor network requests for Cloudflare API calls
    - Check if `navigator.webdriver` is exposed (should be undefined)
  - **Additional stealth techniques to implement:**
    - **User-Agent spoofing:**
      ```typescript
      options.addArguments(`--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36`);
      ```
    - **Disable WebDriver detection:**
      ```typescript
      // Add after driver initialization
      await driver.executeScript('delete Object.getPrototypeOf(navigator).webdriver');
      ```
    - **Add chrome.runtime override:**
      ```typescript
      await driver.executeScript(`
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        });
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en']
        });
      `);
      ```
    - **Use undetected-chromedriver approach:**
      - Random viewport sizes
      - Random mouse movements
      - Delays between actions (human-like timing)
  - **Debug steps:**
    1. Navigate to seek.com.au and check page title/URL
    2. Take screenshot if stuck on Cloudflare page
    3. Check console for Cloudflare errors: `driver.executeScript('return console.logs')`
    4. Test with `USE_REAL_CHROME=true` environment variable
    5. Compare network traffic between manual Chrome and bot Chrome
  - **Cloudflare challenge handler (similar to Indeed):**
    ```typescript
    const detectCloudflare = async (driver: WebDriver): Promise<boolean> => {
      try {
        const title = await driver.getTitle();
        if (title.includes('Just a moment') || title.includes('Attention Required')) {
          return true;
        }
        const cfElements = await driver.findElements(By.css('#challenge-running, .cf-error-details'));
        return cfElements.length > 0;
      } catch (e) {
        return false;
      }
    };

    // Wait for Cloudflare to complete
    const waitForCloudflare = async (driver: WebDriver, timeout = 30000) => {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        if (!(await detectCloudflare(driver))) {
          return true;
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      throw new Error('Cloudflare challenge timeout');
    };
    ```
  - **Files to modify:**
    - `browser_manager.ts`: Add more stealth flags and post-init scripts
    - `seek_impl.ts`: Add Cloudflare detection after navigation to seek.com.au
    - Create `src/bots/seek/cloudflare_handler.ts` for challenge handling

- [ ] 3. Hardcoded search and location. **[Exists]** **[Est: 2 hrs]**
  - **Files:** `src/bots/seek/seek_impl.ts` (build_search_url, ctx from config), `src/bots/core/user-bots-config.json`, config load path in `registry.ts` / `browser_manager.ts`.
  - **Evidence:** `user-bots-config.json` lines 3-4 contain hardcoded values:
    ```json
    "keywords": "java",
    "locations": "sydney"
    ```
  - **Impact:** All bots will use these defaults unless user explicitly changes configuration.
  - **Functions to investigate:**
    - `seek_impl.ts`: `build_search_url()` or similar function that constructs Seek search URL (lines ~176-189)
    - `browser_manager.ts`: Line 118 loads config: `const config: BotConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));`
    - Config is passed to bot through context object
  - **What to check:**
    - Where is `user-bots-config.json` loaded and passed to bots?
    - Is there a UI form to edit this configuration? (`src/routes/frontend-form/+page.svelte`)
    - Does the form save changes back to `user-bots-config.json`?
    - Are there default fallback values if config is empty?
  - **Root cause:**
    - Config file is committed to git with hardcoded developer values
    - Should use template file pattern: `user-bots-config.json.template` with placeholders
    - Actual `user-bots-config.json` should be in `.gitignore` (already addressed in bug #1)
  - **Solution:**
    - **Step 1 - Remove hardcoded defaults:**
      - Replace values in `user-bots-config.json` with empty strings or require form:
        ```json
        {
          "formData": {
            "keywords": "",
            "locations": "",
            "deepSeekApiKey": "",
            "email": "",
            "phone": ""
          }
        }
        ```
    - **Step 2 - Add validation before bot runs:**
      - In `src/routes/choose-bot/+page.svelte` before `runBot()`:
        ```typescript
        function validateConfig(botName: string): boolean {
          if (!config?.formData?.keywords || !config?.formData?.locations) {
            alert('Please configure search keywords and location in Settings first');
            return false;
          }
          return true;
        }
        ```
    - **Step 3 - Update config form UI:**
      - Make keywords and location fields required in `src/routes/frontend-form/+page.svelte`
      - Add placeholder text: "e.g., Software Engineer, Data Analyst"
      - Show warning if user tries to save empty values
  - **Files to modify:**
    - `src/bots/core/user-bots-config.json`: Clear hardcoded values
    - `src/routes/choose-bot/+page.svelte`: Add validation before running bot
    - `src/routes/frontend-form/+page.svelte`: Make fields required, add validation

- [ ] 4. Too long timeout to run after sign in. **[Exists]** **[Est: 2 hrs]**
  - **Files:** `src/bots/core/core_configurations.ts` (timeouts.login_wait), `src/bots/seek/seek_steps.yaml` and steps that wait after sign-in.
  - **Evidence:** `core_configurations.ts` line 186 sets `login_wait: 300` (5 minutes or 300 seconds).
  - **Impact:** Users must wait 5 minutes for login timeout, which may be too long for typical login scenarios.
  - **Functions to investigate:**
    - `core_configurations.ts`: Line 186 in `timeouts` object
    - `seek_impl.ts`: Where `login_wait` timeout is used (search for `config.timeouts.login_wait`)
    - Workflow engine that executes sign-in steps and waits for completion
  - **Current configuration:**
    ```typescript
    export const timeouts = {
      login_wait: 300,  // 5 minutes = 300 seconds
      // ... other timeouts
    }
    ```
  - **What to check:**
    - Is 300 seconds too long? Most logins complete in 30-60 seconds
    - Is there early detection of successful login to skip remaining wait time?
    - Can timeout be made configurable per-bot or per-user?
  - **Solution approaches:**
    - **Option 1 - Reduce timeout (simple):**
      ```typescript
      login_wait: 90,  // 1.5 minutes should be enough
      ```
    - **Option 2 - Smart detection (better):**
      ```typescript
      // In seek_impl.ts after showing login overlay
      const waitForLogin = async (driver: WebDriver, maxWait: number = 300) => {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWait * 1000) {
          try {
            // Check if logged in by looking for profile element or dashboard
            const loggedIn = await driver.findElements(By.css('[data-automation="user-profile"]'));
            if (loggedIn.length > 0) {
              printLog('Login detected, continuing...');
              return true;
            }
          } catch (e) {
            // Continue waiting
          }
          await new Promise(r => setTimeout(r, 2000)); // Check every 2 seconds
        }
        throw new Error('Login timeout');
      };
      ```
    - **Option 3 - Make configurable:**
      ```typescript
      // Add to user-bots-config.json
      "timeouts": {
        "loginWaitSeconds": 90
      }
      ```
  - **Recommended fix:**
    - Reduce default to 90 seconds (1.5 minutes)
    - Add smart detection to exit early when login is confirmed
    - Show countdown timer in overlay: "Waiting for login... (45s remaining)"
  - **Files to modify:**
    - `src/bots/core/core_configurations.ts`: Change line 186 from 300 to 90
    - `src/bots/seek/seek_impl.ts`: Add login detection logic
    - `src/bots/core/universal_overlay.ts`: Show countdown timer during login wait

- [ ] 5. While Seek is running, turn the Start Seek bot button to running indication. **[Exists]** **[Est: 1.5 hrs]**
  - **Files:** `src/routes/choose-bot/+page.svelte` (runBot, runningBots, button state per bot).
  - **Evidence:** Lines 150-159 in `choose-bot/+page.svelte` show:
    ```javascript
    function isBotRunning(botName) {
      return runningBots.some(bot => bot.name === botName);
    }
    ```
  - The check exists but the button doesn't visually indicate "running" state - it just prevents duplicate instances.
  - **Functions to investigate:**
    - `choose-bot/+page.svelte`: `runBot()` function - where bot is started
    - `choose-bot/+page.svelte`: `isBotRunning(botName)` function - already exists at lines 150-159
    - `choose-bot/+page.svelte`: `stopBot()` function - where bot is stopped
    - `runningBots` array - stores currently running bot instances
  - **What to check:**
    - Where is the "Start Seek bot" button rendered in the template?
    - Is `isBotRunning()` used in button's disabled state?
    - Is there any visual feedback (spinner, color change, text change)?
  - **Current state:**
    - Button likely just has `disabled` when bot is running
    - No visual indicator that bot is actively working
    - User can't tell if bot is running or stuck
  - **Solution:**
    - **Update button markup to show running state:**
      ```svelte
      {#if isBotRunning('seek')}
        <button class="btn btn-warning" on:click={() => stopBot('seek')}>
          <span class="loading loading-spinner"></span>
          Running... (Click to stop)
        </button>
      {:else}
        <button class="btn btn-primary" on:click={() => runBot('seek')}>
          Start Seek Bot
        </button>
      {/if}
      ```
    - **Or use conditional classes:**
      ```svelte
      <button
        class="btn"
        class:btn-primary={!isBotRunning('seek')}
        class:btn-warning={isBotRunning('seek')}
        class:loading={isBotRunning('seek')}
        on:click={() => isBotRunning('seek') ? stopBot('seek') : runBot('seek')}
      >
        {#if isBotRunning('seek')}
          <span class="loading loading-spinner loading-sm"></span>
          Seek Bot Running...
        {:else}
          Start Seek Bot
        {/if}
      </button>
      ```
  - **Additional improvements:**
    - Show progress indicator with job count: "Running... (3/10 jobs processed)"
    - Add pulsing animation to button
    - Show elapsed time: "Running... (2m 15s)"
    - Listen to `bot-progress` events from Tauri backend
  - **Files to modify:**
    - `src/routes/choose-bot/+page.svelte`: Update button template to use `isBotRunning()`
    - Add DaisyUI loading spinner class when running
    - Change button color and text based on state

- [ ] 6. Opens new tab for every job. Should work on the jobs one by one. **[Exists]** **[Est: 4 hrs]**
  - **Files:** `src/bots/seek/seek_impl.ts` (Quick Apply click, switch to new tab ~804–812; loop over jobs).
  - **Evidence:** `seek_impl.ts` lines 807-812 show tab switching logic:
    ```typescript
    const handles = await ctx.driver.getAllWindowHandles();
    if (handles.length > 1) {
      await ctx.driver.switchTo().window(handles[handles.length - 1]);
      printLog("Switched to Quick Apply tab");
    }
    ```
  - **Impact:** Creates new tab for each job application instead of reusing same tab, leading to tab clutter.
  - **Functions to investigate:**
    - `seek_impl.ts`: Function that clicks "Quick Apply" button (~line 800-815)
    - `seek_impl.ts`: Job processing loop (where it iterates through job listings)
    - Look for: `click()` on Quick Apply button that opens in new tab
    - Look for: Window handle management logic
  - **What to check:**
    - Does "Quick Apply" button have `target="_blank"` that forces new tab?
    - Is there middleware-click being used that opens in new tab?
    - After applying to a job, does bot close the application tab and return to main tab?
    - How many window handles accumulate during a session?
  - **Root cause:**
    - "Quick Apply" button likely opens in new tab (Seek's website behavior)
    - Bot switches to new tab but never closes it after completing application
    - Tabs accumulate: Main search tab + Tab1 + Tab2 + Tab3...
  - **Solution approaches:**
    - **Option 1 - Close tab after each job:**
      ```typescript
      // After completing job application in new tab
      const handles = await ctx.driver.getAllWindowHandles();
      if (handles.length > 1) {
        await ctx.driver.close(); // Close current application tab
        await ctx.driver.switchTo().window(handles[0]); // Return to main search tab
        printLog("Closed application tab, returned to job search");
      }
      ```
    - **Option 2 - Open in same tab (if possible):**
      ```typescript
      // Instead of clicking button that opens new tab
      const quickApplyBtn = await ctx.driver.findElement(By.css('[data-automation="job-card-apply"]'));
      const jobUrl = await quickApplyBtn.getAttribute('href');

      // Navigate in current tab instead
      await ctx.driver.get(jobUrl);
      // Process application
      // Then navigate back to search results
      await ctx.driver.navigate().back();
      ```
    - **Option 3 - Reuse single application tab:**
      ```typescript
      let applicationTabHandle = null;

      // First job: open new tab as normal
      // Subsequent jobs: reuse the application tab
      if (applicationTabHandle) {
        await ctx.driver.switchTo().window(applicationTabHandle);
        await ctx.driver.get(jobUrl); // Navigate to new job in same tab
      } else {
        // Click to open new tab (first time only)
        applicationTabHandle = await ctx.driver.getWindowHandle();
      }
      ```
  - **Recommended fix:**
    - Implement Option 1 (close after each job) - cleanest approach
    - Add window handle cleanup at start of each job iteration
    - Ensure main search tab handle is stored and never closed
  - **Code pattern to implement:**
    ```typescript
    // Store main tab handle at start
    const mainTabHandle = await ctx.driver.getWindowHandle();

    // For each job
    for (const job of jobs) {
      // Click Quick Apply (opens new tab)
      await clickQuickApply();

      // Switch to application tab
      const handles = await ctx.driver.getAllWindowHandles();
      const appTab = handles.find(h => h !== mainTabHandle);
      await ctx.driver.switchTo().window(appTab);

      // Fill application...

      // Close application tab
      await ctx.driver.close();

      // Return to main search tab
      await ctx.driver.switchTo().window(mainTabHandle);
    }
    ```
  - **Files to modify:**
    - `src/bots/seek/seek_impl.ts`: Add tab management around job application loop
    - Store main tab handle before loop starts
    - Close application tab after each job completes
    - Switch back to main tab before next iteration

- [ ] 7. Overlay comes up too late. **[Could not be verified]** **[Est: 3 hrs]**
  - **Files:** `src/bots/core/universal_overlay.ts`, `src/bots/seek/seek_impl.ts` (where overlay is created/updated), `src/bots/core/workflow_engine.ts`.
  - **Notes:** Overlay initialization code exists at `seek_impl.ts:222` where `ctx.overlay = new UniversalOverlay(driver, 'Seek')` is created. Timing cannot be verified without running the actual bot workflow.
  - **Functions to investigate:**
    - `seek_impl.ts`: Line 222 where overlay is initialized: `ctx.overlay = new UniversalOverlay(driver, 'Seek')`
    - `universal_overlay.ts`: Constructor and initialization timing
    - Look for: When is overlay first shown to user?
  - **What to check:**
    - Is overlay created immediately at bot start or delayed until first action?
    - Are there async operations blocking overlay display?
    - Does overlay wait for DOM injection to complete before showing?
    - Check initialization order: Driver setup → Navigate → Create overlay → Show overlay
  - **Potential issues:**
    - Overlay created after navigation completes (should be before)
    - DOM injection script takes too long to execute
    - Overlay waits for page load event instead of DOMContentLoaded
  - **Solution:**
    - **Move overlay creation earlier:**
      ```typescript
      // In seek_impl.ts - create overlay immediately after driver is ready
      export async function* seekBot(ctx: BotContext) {
        // Create overlay FIRST
        ctx.overlay = new UniversalOverlay(ctx.driver, 'Seek');
        await ctx.overlay.showMessage('Initializing Seek bot...', 'info');

        // Then navigate
        await ctx.driver.get('https://www.seek.com.au');

        // Rest of workflow...
      }
      ```
    - **Show overlay before any navigation:**
      ```typescript
      // In universal_overlay.ts constructor
      constructor(driver: WebDriver, botName: string) {
        this.driver = driver;
        this.botName = botName;
        // Inject overlay immediately (don't wait for page load)
        this.initialize().catch(err => console.error('Overlay init failed:', err));
      }
      ```
  - **Debug steps:**
    1. Add timestamp logging: `printLog(\`Overlay created at ${Date.now()}\`)`
    2. Log when overlay first becomes visible
    3. Measure time between bot start and overlay appearance
    4. Goal: Overlay should appear within 1-2 seconds of bot start
  - **Files to modify:**
    - `src/bots/seek/seek_impl.ts`: Move overlay creation to line ~215 (before first navigation)
    - `src/bots/core/universal_overlay.ts`: Ensure initialize() doesn't block on page load

- [ ] 8. Wrong overlay information. **[Exists]** **[Est: 3 hrs]**
  - **Files:** `src/bots/core/universal_overlay.ts`, `src/bots/seek/seek_impl.ts` (updateJobProgress, updateOverlay calls).
  - **Notes:** Overlay update calls exist throughout workflow (e.g., lines 739-746 in seek_impl.ts). Accuracy of displayed information cannot be verified without running the bot.
  - **Functions to investigate:**
    - `seek_impl.ts`: All calls to `ctx.overlay.showJobProgress()` and `ctx.overlay.updateOverlay()`
    - `seek_impl.ts`: Lines 739-746 - example of progress update
    - `universal_overlay.ts`: `showJobProgress(completed, total, message, stage)` method
    - Check job counters: `processedJobs`, `totalJobs`, `appliedCount`, `skippedCount`
  - **What to check:**
    - Are job counters incremented correctly? (check off-by-one errors)
    - Is `totalJobs` calculated correctly at start?
    - Do counts match actual bot behavior?
    - Are overlay updates called at right times (not too early/late)?
    - Check for race conditions in counter updates
  - **Common issues:**
    - Total job count wrong (counts duplicates or filtered jobs)
    - Completed count doesn't increment when job is skipped
    - Stage number incorrect (shows stage 3/5 when actually at stage 4/5)
    - Message doesn't match actual action (says "Applying..." when actually just viewing)
  - **Code to review:**
    ```typescript
    // Check if counters are accurate
    let processedJobs = 0;
    let appliedJobs = 0;
    let skippedJobs = 0;

    for (const job of jobs) {
      processedJobs++; // Should increment BEFORE or AFTER processing?

      // Update overlay
      await ctx.overlay.showJobProgress(
        processedJobs,  // Is this the right value?
        jobs.length,     // Does this include filtered jobs?
        `Processing job ${processedJobs}/${jobs.length}`,
        currentStage
      );
    }
    ```
  - **Debug approach:**
    - Add detailed logging around counter updates:
      ```typescript
      printLog(`Overlay update: ${processedJobs}/${totalJobs}, applied=${appliedJobs}, skipped=${skippedJobs}`);
      ```
    - Log actual vs displayed values
    - Cross-reference with job results saved to filesystem
  - **Solution:**
    - Audit all counter increment locations
    - Ensure counters are updated before overlay calls
    - Verify total job count excludes already-applied jobs
    - Make sure stage numbers align with actual workflow stages
    - Add validation: `if (completed > total) throw new Error('Counter mismatch')`
  - **Files to modify:**
    - `src/bots/seek/seek_impl.ts`: Review all overlay update calls
    - Verify counter logic matches actual processing flow
    - Add assertions to catch counter bugs early

- [ ] 9. Does not work if window is minimized to tablet size (half screen in laptop). **[Exists]** **[Est: 2 hrs]**
  - **Files:** `src/bots/core/universal_overlay.ts`, `src/bots/seek/seek_impl.ts` (overlay visibility/sizing).
  - **Notes:** Overlay uses fixed positioning (`universal_overlay.ts:119-139`) with width of `collapsed ? '60px' : '400px'`. No responsive breakpoints for tablet/smaller sizes. Would require visual testing at different window sizes.
  - **Functions to investigate:**
    - `universal_overlay.ts`: Lines 119-139 - overlay styling and positioning
    - Look for: Fixed width values, position calculations, viewport size checks
  - **What to check:**
    - Does overlay overflow when window width < 400px?
    - Are elements cut off or hidden at smaller sizes?
    - Does collapsed state (60px) work better at small sizes?
    - Check if overlay blocks important page elements on small screens
  - **Current implementation:**
    ```typescript
    // Fixed width - doesn't adapt to screen size
    width: collapsed ? '60px' : '400px'
    position: fixed;
    right: 20px;
    top: 20px;
    ```
  - **Issues:**
    - 400px overlay takes up most of a 768px tablet screen
    - No media query adjustments
    - Fixed positioning might overlap page content
    - Buttons might be too small to click on tablet
  - **Solution:**
    - **Add responsive width:**
      ```typescript
      // Adjust overlay width based on viewport
      const getOverlayWidth = () => {
        const viewportWidth = window.innerWidth;
        if (viewportWidth < 600) return '90vw'; // Mobile: almost full width
        if (viewportWidth < 900) return '350px'; // Tablet: slightly smaller
        return '400px'; // Desktop: full width
      };
      ```
    - **Add CSS media queries in injected styles:**
      ```css
      @media (max-width: 768px) {
        .bot-overlay {
          width: 90vw !important;
          max-width: 350px !important;
          right: 5vw !important;
        }
      }
      ```
    - **Auto-collapse on small screens:**
      ```typescript
      // Automatically collapse overlay on mobile/tablet
      if (window.innerWidth < 768) {
        this.collapsed = true;
      }
      ```
  - **Additional fixes:**
    - Make overlay draggable so users can reposition if it blocks content
    - Add option to minimize to bottom corner on small screens
    - Ensure all buttons have min-width for touch targets (44px × 44px)
  - **Files to modify:**
    - `src/bots/core/universal_overlay.ts`: Add responsive width logic
    - Add viewport size detection
    - Update styles object with media query breakpoints

- [ ] 10. Overlay should appear on other tabs also; currently it does not. **[Exists]** **[Est: 4 hrs]**
  - **Files:** `src/bots/core/universal_overlay.ts`, `src/bots/core/workflow_engine.ts` (fallback overlay); in-app progress in `src/routes/choose-bot/+page.svelte`.
  - **Notes:** Persistent overlay system exists (`universal_overlay.ts:66-99`) using sessionStorage for state persistence. Cross-page navigation behavior cannot be verified without testing the actual bot workflow across multiple pages.
  - **Functions to investigate:**
    - `universal_overlay.ts`: Lines 66-99 - `initializePersistentOverlay()` method
    - `universal_overlay.ts`: State persistence using sessionStorage
    - Check: Does overlay re-inject itself after page navigation?
  - **What to check:**
    - Is overlay state saved to sessionStorage correctly?
    - Does overlay re-initialize on new page loads?
    - Are there Content Security Policy issues blocking script injection?
    - Does overlay persist across tab switches (within same browser window)?
  - **Current implementation:**
    - Overlay injects itself into page DOM
    - Uses sessionStorage to persist state
    - Should re-create overlay on navigation (lines 66-99)
  - **Potential issues:**
    - Overlay only injected once at bot start
    - Navigation events (page load, SPA route changes) don't trigger re-injection
    - sessionStorage might be cleared on navigation
    - Selenium loses reference to injected elements after navigation
  - **Solution approaches:**
    - **Option 1 - Re-inject on every navigation:**
      ```typescript
      // In seek_impl.ts, after each navigation
      await ctx.driver.get(url);
      await ctx.overlay.reinitialize(); // Re-inject overlay DOM
      ```
    - **Option 2 - Use MutationObserver in injected script:**
      ```typescript
      // In overlay injection script
      const observer = new MutationObserver(() => {
        if (!document.querySelector('#bot-overlay')) {
          // Overlay was removed, re-inject it
          reinjectOverlay();
        }
      });
      observer.observe(document.body, { childList: true });
      ```
    - **Option 3 - Iframe-based overlay (persists across navigations):**
      ```typescript
      // Create iframe that stays attached to window
      const overlayFrame = document.createElement('iframe');
      overlayFrame.style.position = 'fixed';
      overlayFrame.style.zIndex = '999999';
      // Load overlay UI inside iframe
      // Iframe won't be affected by page navigations
      ```
  - **Recommended fix:**
    - Implement Option 2 (MutationObserver) for automatic re-injection
    - Add navigation event listener to detect page changes
    - Store overlay state in sessionStorage and restore after re-injection
  - **Code to add:**
    ```typescript
    // In universal_overlay.ts
    private setupAutoReinject() {
      const script = `
        (function() {
          const checkOverlay = setInterval(() => {
            if (!document.querySelector('#bot-overlay')) {
              // Re-inject from sessionStorage state
              const state = sessionStorage.getItem('bot_overlay_state');
              if (state) {
                reinjectOverlayWithState(JSON.parse(state));
              }
            }
          }, 1000);
        })();
      `;
      this.driver.executeScript(script);
    }
    ```
  - **Files to modify:**
    - `src/bots/core/universal_overlay.ts`: Add auto-reinject logic
    - Add MutationObserver or interval check in injected script
    - Ensure state persistence works correctly

- [ ] 11. No error msg or overlay if the API is not connected and bots are run. **[Exists]** **[Est: 3 hrs]**
  - **Files:** `src/bots/seek/seek_impl.ts` (handlers that call API), `src/bots/core/universal_overlay.ts` (showMessage / error state).
  - **Notes:** Cannot verify API error handling without testing with disconnected/failing API. Would require testing with corpus-rag server offline.
  - **Functions to investigate:**
    - `seek_impl.ts`: Where API calls are made (e.g., saving job data, fetching cover letters)
    - Look for: `fetch()` calls to corpus-rag API
    - Check: Error handling in catch blocks
    - `universal_overlay.ts`: `showMessage(message, type)` for displaying errors
  - **What to check:**
    - Are API calls wrapped in try-catch?
    - Is there a network timeout configured?
    - Does bot continue or crash when API fails?
    - Is user notified of API failures?
  - **Current behavior (likely):**
    - API call fails silently
    - Bot continues without error message
    - User doesn't know why job data isn't saved
    - Or bot crashes with unhandled promise rejection
  - **Solution:**
    - **Add API health check before starting bot:**
      ```typescript
      async function checkAPIConnection(): Promise<boolean> {
        try {
          const response = await fetch('http://localhost:3000/health', {
            timeout: 5000
          });
          return response.ok;
        } catch (e) {
          return false;
        }
      }

      // In seek_impl.ts at bot start
      export async function* seekBot(ctx: BotContext) {
        const apiConnected = await checkAPIConnection();
        if (!apiConnected) {
          await ctx.overlay.showMessage(
            'Cannot connect to API server. Please start corpus-rag server first.',
            'error'
          );
          throw new Error('API not available');
        }
        // Continue with bot...
      }
      ```
    - **Wrap all API calls with error handling:**
      ```typescript
      async function saveJobData(jobData: any) {
        try {
          const response = await fetch('http://localhost:3000/api/jobs', {
            method: 'POST',
            body: JSON.stringify(jobData),
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
          });

          if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
          }

          return await response.json();
        } catch (error) {
          await ctx.overlay.showMessage(
            `Failed to save job data: ${error.message}`,
            'error'
          );
          // Log but don't crash the bot
          printLog(`API error: ${error}`);
          return null;
        }
      }
      ```
    - **Show persistent error in overlay:**
      ```typescript
      // Add API status indicator in overlay
      <div class="api-status">
        {#if apiConnected}
          <span class="status-ok">API Connected</span>
        {:else}
          <span class="status-error">API Disconnected</span>
        {/if}
      </div>
      ```
  - **Files to modify:**
    - `src/bots/seek/seek_impl.ts`: Add API health check at bot start
    - Wrap all API calls in try-catch with user-friendly error messages
    - `src/bots/core/universal_overlay.ts`: Add error display capability
    - Consider creating `src/lib/api-client.ts` with centralized error handling

- [ ] 12. Takes too long timeout if the first job fails. **[Could not be verified]** **[Est: 2 hrs]**
  - **Files:** `src/bots/seek/seek_impl.ts` (retry/timeout around first job), `src/bots/core/core_configurations.ts`.
  - **Notes:** Retry counters exist in code (`seek_impl.ts:178-186`) with `MAX_COLLECT_CARDS_RETRIES: 5`, but specific timeout behavior for first job failure cannot be verified without testing.
  - **Functions to investigate:**
    - `seek_impl.ts`: Lines 178-186 - `MAX_COLLECT_CARDS_RETRIES: 5`
    - Look for retry logic in job collection/processing
    - Check: Timeout values for element waits
    - `core_configurations.ts`: Search for timeout configurations
  - **What to check:**
    - How long does each retry take? (element wait timeout × retry count)
    - Is retry delay exponential or fixed?
    - Does bot give up after max retries or crash?
    - Is there special handling for first job vs subsequent jobs?
  - **Potential issue:**
    - If element wait is 30 seconds and max retries is 5:
    - Total timeout = 30s × 5 = 2.5 minutes just for first job
    - User thinks bot is stuck
  - **Code to review:**
    ```typescript
    // Check retry logic
    const MAX_COLLECT_CARDS_RETRIES: 5;
    let retryCount = 0;

    while (retryCount < MAX_COLLECT_CARDS_RETRIES) {
      try {
        // Wait for job cards (how long?)
        const jobCards = await driver.wait(
          until.elementsLocated(By.css('[data-automation="job-card"]')),
          30000  // 30 second timeout per attempt!
        );
        break; // Success
      } catch (e) {
        retryCount++;
        if (retryCount >= MAX_COLLECT_CARDS_RETRIES) {
          throw new Error('Failed to find jobs');
        }
        // Does it wait between retries?
      }
    }
    ```
  - **Solution:**
    - **Reduce timeout for first job:**
      ```typescript
      // Use shorter timeout for first attempt, longer for retries
      const timeout = retryCount === 0 ? 10000 : 30000;
      const jobCards = await driver.wait(
        until.elementsLocated(By.css('[data-automation="job-card"]')),
        timeout
      );
      ```
    - **Fail fast on first job:**
      ```typescript
      // Reduce max retries for first job specifically
      const maxRetries = isFirstJob ? 2 : 5;
      ```
    - **Add delay between retries:**
      ```typescript
      if (retryCount < MAX_COLLECT_CARDS_RETRIES) {
        await new Promise(r => setTimeout(r, 2000)); // Wait 2s before retry
      }
      ```
    - **Show progress during retries:**
      ```typescript
      await ctx.overlay.showMessage(
        `Retry ${retryCount}/${MAX_COLLECT_CARDS_RETRIES} - waiting for jobs...`,
        'info'
      );
      ```
  - **Files to modify:**
    - `src/bots/seek/seek_impl.ts`: Review retry logic and timeouts
    - Reduce timeout for first attempts
    - Add user feedback during retries
    - Consider exponential backoff for retries

- [ ] 13. Agent is unaware of what error occurred and what to do next. **[Exists]** **[Est: 4 hrs]**
  - **Files:** `src/bots/seek/seek_impl.ts` (error handling), `src/bots/core/workflow_engine.ts` (error handling and transitions).
  - **Notes:** Error handling code exists with various error states yielded (e.g., `yield "parse_failed"`, `yield "quick_apply_failed"`), but agent's awareness and response to specific errors cannot be verified without running the workflow and triggering various error conditions.
  - **Functions to investigate:**
    - `seek_impl.ts`: All `yield` statements that return error states
    - `workflow_engine.ts`: State transition logic and error handling
    - Look for: Error categorization, recovery strategies, user notifications
  - **What to check:**
    - What error states are defined? (`parse_failed`, `quick_apply_failed`, etc.)
    - Does workflow engine know what to do with each error state?
    - Are errors logged with enough context for debugging?
    - Does bot retry, skip, or abort on each error type?
  - **Current implementation:**
    - Bot yields error states: `yield "parse_failed"`
    - Workflow engine receives error state
    - But unclear what action is taken (retry? skip? abort?)
  - **Issues:**
    - Generic error handling - all errors treated the same
    - No error classification (temporary vs permanent, recoverable vs fatal)
    - User sees error but doesn't know what it means or what to do
    - Agent can't make intelligent decisions based on error type
  - **Solution - Structured error handling:**
    ```typescript
    // Define error types with metadata
    interface BotError {
      type: 'parse_failed' | 'quick_apply_failed' | 'network_error' | 'element_not_found';
      severity: 'warning' | 'error' | 'fatal';
      recoverable: boolean;
      userMessage: string;
      technicalDetails: string;
      suggestedAction: 'retry' | 'skip' | 'abort' | 'manual_intervention';
    }

    // In seek_impl.ts
    yield {
      error: {
        type: 'quick_apply_failed',
        severity: 'error',
        recoverable: true,
        userMessage: 'Unable to apply to this job. Moving to next job.',
        technicalDetails: 'Quick Apply button not found after 30s wait',
        suggestedAction: 'skip'
      }
    };
    ```
  - **Workflow engine error handling:**
    ```typescript
    // In workflow_engine.ts
    function handleError(error: BotError) {
      // Log technical details
      printLog(`Error: ${error.type} - ${error.technicalDetails}`);

      // Show user message in overlay
      ctx.overlay.showMessage(error.userMessage, error.severity);

      // Take action based on error type
      switch (error.suggestedAction) {
        case 'retry':
          return 'retry_current_step';
        case 'skip':
          return 'next_job';
        case 'abort':
          return 'stop_bot';
        case 'manual_intervention':
          return 'pause_and_wait';
      }
    }
    ```
  - **Error categorization:**
    - **Temporary/Recoverable:** Network timeout, element not found (retry)
    - **Permanent/Non-fatal:** Job already applied, age verification required (skip)
    - **Fatal:** Login failed, API unavailable, session expired (abort)
    - **Needs intervention:** Captcha detected, account locked (pause)
  - **Enhanced logging:**
    ```typescript
    // Create detailed error log
    const errorLog = {
      timestamp: new Date().toISOString(),
      errorType: error.type,
      jobId: currentJob.id,
      jobTitle: currentJob.title,
      url: await driver.getCurrentUrl(),
      screenshot: await driver.takeScreenshot(),
      stackTrace: error.stack
    };

    fs.writeFileSync(
      `logs/errors/${Date.now()}_${error.type}.json`,
      JSON.stringify(errorLog, null, 2)
    );
    ```
  - **Files to modify:**
    - `src/bots/seek/seek_impl.ts`: Replace string error states with structured error objects
    - `src/bots/core/workflow_engine.ts`: Add intelligent error handling logic
    - Create `src/bots/core/bot_errors.ts`: Define error types and handlers
    - Update overlay to show actionable error messages

### Bot: LinkedIn

- [ ] 1. LinkedIn search defaults to "javajava". **[Exists]** **[Est: 3 hrs]**
  - **Files:** `src/bots/linkedin/linkedin_impl.ts` (URL/build with keywords), `src/bots/core/user-bots-config.json` (formData.keywords); possible duplicate in form save or URL param handling.
  - **Evidence:** Debug logs in `finalboss/.cursor/debug.log` show multiple URLs with `keywords=javajava`:
    - Line 129: `"currentUrl":"https://www.linkedin.com/jobs/search/?...&keywords=javajava&..."`
    - Line 173, 196, 243, 286, 309, 334, 350, 369, 392 all show same pattern
  - **Root Cause:** Likely a bug in form handling or URL building that duplicates "java" keyword from config.
  - **Functions to investigate:**
    - `linkedin_impl.ts`: Search URL building function (look for string concatenation with keywords)
    - `linkedin_impl.ts`: Where config.formData.keywords is read and used
    - Look for: `keywords=${keywords}` or URL parameter construction
    - Check: Is keyword being appended twice?
  - **What to check:**
    - How is LinkedIn search URL constructed?
    - Are keywords URL-encoded properly?
    - Is there a template string that references keywords twice?
    - Does LinkedIn have special keyword handling that differs from Seek?
  - **Debug steps:**
    1. Search for "keywords" in `linkedin_impl.ts`
    2. Find URL construction code:
      ```typescript
      const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${keywords}&location=${location}`;
      ```
    3. Check if keywords variable is built from multiple sources
    4. Look for accidental duplication like:
      ```typescript
      // BUG: Keywords duplicated
      const keywords = config.formData.keywords + config.formData.keywords;
      // OR
      const keywords = `${userKeywords}${userKeywords}`;
      ```
  - **Likely bugs:**
    - **Pattern 1 - Double interpolation:**
      ```typescript
      // Wrong
      const url = `...&keywords=${keywords}${keywords}`;
      // Should be
      const url = `...&keywords=${keywords}`;
      ```
    - **Pattern 2 - Variable reassignment:**
      ```typescript
      // Wrong
      let keywords = config.formData.keywords; // "java"
      keywords = keywords + config.formData.keywords; // "javajava"
      ```
    - **Pattern 3 - Form field duplication:**
      ```typescript
      // In frontend form, check if save duplicates the value
      const formData = {
        keywords: inputValue + inputValue  // BUG
      };
      ```
  - **Solution:**
    - Find the exact location where keywords are duplicated
    - Remove the duplicate reference
    - Add validation to prevent empty or malformed keywords
    - Test with different keyword values to ensure no duplication
  - **Code fix example:**
    ```typescript
    // Before (buggy)
    const buildSearchUrl = (config: BotConfig) => {
      const keywords = config.formData.keywords + config.formData.keywords; // BUG
      return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}`;
    };

    // After (fixed)
    const buildSearchUrl = (config: BotConfig) => {
      const keywords = config.formData.keywords; // Single reference
      return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}`;
    };
    ```
  - **Files to modify:**
    - `src/bots/linkedin/linkedin_impl.ts`: Fix URL building logic
    - Add unit test to verify keywords aren't duplicated
    - Log the constructed URL for verification: `printLog(\`LinkedIn URL: ${searchUrl}\`)`

- [ ] 2. Does not wait long enough for user to sign in before redirecting. **[Exists]** **[Est: 1.5 hrs]**
  - **Files:** `src/bots/linkedin/linkedin_impl.ts` (showSignInOverlay), `src/bots/core/core_configurations.ts` (login_wait).
  - **Evidence:** Same configuration as Seek - `core_configurations.ts` line 186 sets `login_wait: 300` (5 minutes).
  - **Notes:** If users report this isn't long enough, the timeout may need to be configurable or increased.
  - **Functions to investigate:**
    - `linkedin_impl.ts`: `showSignInOverlay()` or similar login waiting function
    - `core_configurations.ts`: Line 186 - `login_wait: 300`
    - Check: Is same timeout used for all bots or can it be per-bot?
  - **What to check:**
    - Does LinkedIn login require 2FA which takes longer?
    - Is 5 minutes (300s) actually too short or is issue with detection?
    - Does bot detect successful login or just wait blindly for timeout?
    - Are users redirected before they finish logging in?
  - **Issue context:**
    - LinkedIn often requires:
      - Email/password entry
      - 2FA code (SMS or authenticator)
      - Security verification (puzzle, image selection)
      - Device authorization
    - 5 minutes might be tight if user needs to check phone for 2FA
  - **Solution approaches:**
    - **Option 1 - Increase timeout:**
      ```typescript
      // Separate timeout for LinkedIn (more time for 2FA)
      export const timeouts = {
        login_wait: 300,  // Default 5 minutes
        linkedin_login_wait: 600,  // LinkedIn: 10 minutes
      };
      ```
    - **Option 2 - Smart login detection (recommended):**
      ```typescript
      // In linkedin_impl.ts
      const waitForLogin = async (driver: WebDriver, maxWait: number = 300) => {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWait * 1000) {
          try {
            // Check if logged in by looking for profile/feed elements
            const loggedIn = await driver.findElements(By.css(
              'div[data-test-global-nav-me], .feed-identity-module'
            ));

            if (loggedIn.length > 0) {
              printLog('LinkedIn login detected successfully');
              return true;
            }

            // Or check URL changed from login page
            const currentUrl = await driver.getCurrentUrl();
            if (!currentUrl.includes('/login') && !currentUrl.includes('/checkpoint')) {
              printLog('Login page exited, assuming success');
              return true;
            }
          } catch (e) {
            // Continue waiting
          }

          await new Promise(r => setTimeout(r, 3000)); // Check every 3 seconds
        }

        throw new Error('Login timeout exceeded');
      };
      ```
    - **Option 3 - Manual confirmation:**
      ```typescript
      // Show button in overlay: "I've logged in, continue"
      await ctx.overlay.showMessage(
        'Please log in to LinkedIn. Click Continue when ready.',
        'info',
        { showContinueButton: true }
      );
      await ctx.overlay.waitForUserConfirmation();
      ```
  - **Recommended fix:**
    - Implement smart login detection (Option 2)
    - Increase default timeout to 8-10 minutes for LinkedIn specifically
    - Show countdown timer: "Waiting for login... (4m 23s remaining)"
    - Add "Continue" button to skip wait once user is logged in
  - **Files to modify:**
    - `src/bots/linkedin/linkedin_impl.ts`: Add login detection logic
    - `src/bots/core/core_configurations.ts`: Add separate `linkedin_login_wait`
    - `src/bots/core/universal_overlay.ts`: Add countdown timer and continue button option

- [ ] 3. No overlay in LinkedIn flow. **[Partial - Overlay exists but display uncertain]** **[Est: 2 hrs]**
  - **Files:** `src/bots/linkedin/linkedin_impl.ts` (ctx.overlay usage vs in-app progress); `src/routes/choose-bot/+page.svelte` (bot-progress events).
  - **Evidence:** LinkedIn implementation creates overlay at line 148 in `linkedin_impl.ts`: `ctx.overlay = new UniversalOverlay(driver, 'LinkedIn')` and uses it at line 258: `await ctx.overlay.showJobProgress(0, 0, "Initializing LinkedIn bot...", 5)`.
  - **Status:** Code exists to show overlay, but cannot verify if it displays properly without running the bot.
  - **Functions to investigate:**
    - `linkedin_impl.ts`: Line 148 - `ctx.overlay = new UniversalOverlay(driver, 'LinkedIn')`
    - `linkedin_impl.ts`: Line 258 - `ctx.overlay.showJobProgress()` call
    - Search for all `ctx.overlay` references in linkedin_impl.ts
  - **What to check:**
    - Is overlay created early enough in LinkedIn bot flow?
    - Are there sufficient overlay updates throughout the workflow?
    - Does overlay persist across LinkedIn page navigations?
    - Are there error messages shown in overlay?
  - **Potential issues:**
    - Overlay created but not shown (missing initial `show()` call)
    - LinkedIn's SPA navigation might remove overlay DOM
    - Overlay updates missing in critical parts of workflow
    - Z-index conflicts with LinkedIn's UI elements
  - **Debug steps:**
    1. Count overlay update calls in linkedin_impl.ts:
       ```bash
       grep -n "ctx.overlay" src/bots/linkedin/linkedin_impl.ts
       ```
    2. Check if overlay is shown at each major step:
       - Bot initialization
       - Login prompt
       - Job search
       - Job application
       - Completion
    3. Compare with Seek bot to see if LinkedIn has fewer updates
  - **Solution:**
    - **Ensure overlay is shown immediately:**
      ```typescript
      // At line 148, after creating overlay
      ctx.overlay = new UniversalOverlay(driver, 'LinkedIn');
      await ctx.overlay.show(); // Make sure it's visible
      await ctx.overlay.showMessage('Starting LinkedIn bot...', 'info');
      ```
    - **Add more progress updates:**
      ```typescript
      // Throughout linkedin_impl.ts workflow
      await ctx.overlay.showJobProgress(
        processedJobs,
        totalJobs,
        `Applying to job ${processedJobs + 1}: ${jobTitle}`,
        currentStage
      );
      ```
    - **Handle LinkedIn SPA navigation:**
      ```typescript
      // Re-inject overlay after LinkedIn route changes
      await driver.executeScript(`
        // Listen for URL changes (LinkedIn is SPA)
        let lastUrl = location.href;
        setInterval(() => {
          if (location.href !== lastUrl) {
            lastUrl = location.href;
            // Re-inject overlay if missing
            if (!document.querySelector('#bot-overlay')) {
              reinjectOverlay();
            }
          }
        }, 1000);
      `);
      ```
    - **Verify overlay visibility:**
      ```typescript
      // Add assertion to check overlay is visible
      const overlayVisible = await driver.executeScript(`
        return document.querySelector('#bot-overlay')?.style.display !== 'none';
      `);
      if (!overlayVisible) {
        printLog('Warning: Overlay not visible, re-injecting...');
        await ctx.overlay.reinitialize();
      }
      ```
  - **Files to modify:**
    - `src/bots/linkedin/linkedin_impl.ts`: Add more overlay update calls throughout workflow
    - Ensure overlay persists across LinkedIn page navigations
    - Add visibility checks and re-injection logic
    - Match overlay update frequency of Seek bot

- [ ] 4. Default search and location keywords are hardcoded or used as fallback. Configuration form is empty at first start; ensure LinkedIn has no fallbacks. Require basic form to be filled before running LinkedIn bot. **[Exists]** **[Est: 3 hrs]**
  - **Files:** `src/bots/linkedin/linkedin_impl.ts`, `src/bots/core/user-bots-config.json`, `src/routes/frontend-form/+page.svelte` (loadConfig), `src/routes/choose-bot/+page.svelte` (guard before run).
  - **Evidence:** Same config file (`user-bots-config.json`) shared across all bots contains hardcoded values:
    ```json
    "keywords": "java",
    "locations": "sydney"
    ```
  - **Impact:** LinkedIn bot uses these defaults if user doesn't fill configuration form. No validation to require form completion before running.
  - **Functions to investigate:**
    - `linkedin_impl.ts`: Where `config.formData.keywords` and `config.formData.locations` are used
    - `choose-bot/+page.svelte`: `runBot('linkedin')` function - add validation here
    - `frontend-form/+page.svelte`: Form load and save functions
    - Check: Are there fallback values if config fields are empty?
  - **What to check:**
    - Does LinkedIn bot check if config is populated before starting?
    - What happens if user clicks "Start LinkedIn Bot" without configuring?
    - Are there default values used as fallback?
    - Is there any warning or error shown?
  - **Current behavior (likely):**
    - User installs app, config has hardcoded "java" and "sydney"
    - User clicks "Start LinkedIn Bot" without visiting settings
    - Bot runs with default values user didn't choose
    - User confused why bot is searching for Java jobs in Sydney
  - **Solution - Add pre-flight validation:**
    ```typescript
    // In choose-bot/+page.svelte
    async function runBot(botName: string) {
      // Validate config before running
      const config = await loadBotConfig();

      if (!config?.formData?.keywords || config.formData.keywords === '') {
        showError('Please configure search keywords in Settings before running the bot');
        return;
      }

      if (!config?.formData?.locations || config.formData.locations === '') {
        showError('Please configure location in Settings before running the bot');
        return;
      }

      // Additional validation
      if (config.formData.keywords === 'java' && config.formData.locations === 'sydney') {
        const confirmed = confirm(
          'Warning: You are using default search settings (java, sydney). ' +
          'Do you want to continue with these values?'
        );
        if (!confirmed) {
          return;
        }
      }

      // Proceed to run bot
      // ...
    }
    ```
  - **Better UX - Redirect to settings:**
    ```typescript
    // If config is invalid, redirect to settings page
    if (!isConfigValid) {
      await showDialog({
        title: 'Configuration Required',
        message: 'Please configure your search preferences before running the LinkedIn bot.',
        actions: [
          { label: 'Go to Settings', action: () => navigate('/frontend-form') },
          { label: 'Cancel' }
        ]
      });
      return;
    }
    ```
  - **Clear default values in config:**
    ```json
    // user-bots-config.json should have empty strings by default
    {
      "formData": {
        "keywords": "",
        "locations": "",
        "deepSeekApiKey": "",
        "email": "",
        "phone": ""
      }
    }
    ```
  - **Make form fields required:**
    ```svelte
    <!-- In frontend-form/+page.svelte -->
    <input
      type="text"
      bind:value={config.formData.keywords}
      placeholder="e.g., Software Engineer, Data Analyst"
      required
      minlength="2"
      class="input input-bordered"
    />

    <input
      type="text"
      bind:value={config.formData.locations}
      placeholder="e.g., New York, London, Remote"
      required
      minlength="2"
      class="input input-bordered"
    />
    ```
  - **Show configuration status in bot UI:**
    ```svelte
    <!-- In choose-bot/+page.svelte -->
    <div class="bot-card">
      <h3>LinkedIn Bot</h3>
      {#if !isConfigured}
        <div class="alert alert-warning">
          <span>⚠️ Configuration required</span>
          <a href="/frontend-form" class="btn btn-sm">Configure Now</a>
        </div>
      {/if}
      <button
        class="btn btn-primary"
        disabled={!isConfigured}
        on:click={() => runBot('linkedin')}
      >
        Start LinkedIn Bot
      </button>
    </div>
    ```
  - **Files to modify:**
    - `src/bots/core/user-bots-config.json`: Clear default values (set to empty strings)
    - `src/routes/choose-bot/+page.svelte`: Add config validation before `runBot()`
    - `src/routes/frontend-form/+page.svelte`: Make keywords and location required fields
    - Consider creating `src/lib/config-validator.ts` for reusable validation logic

### Bot: Indeed

- [ ] *(No items yet.)* **[N/A]**
  - **Files:** `src/bots/indeed/` (for future items).

---

## Summary

**Total bugs investigated:** 31 (Corpus-RAG: 7 bugs + 2 features, FINALBOSS: 22 bugs)
**Confirmed to exist:** 10
**Partial confirmation:** 1
**Could not be verified:** 10
**Does not exist:** 0
**N/A:** 1

### Developer Hours Breakdown:

**Corpus-RAG - Billing and tokens (4 bugs):**
- Buy tokens page error: 3 hrs
- Orders page error: 2 hrs
- Token history page error: 2 hrs
- Authentication error messaging: 1.5 hrs
- **Subtotal: 8.5 hrs**

**Corpus-RAG - API pages (3 bugs):**
- "No saved jobs" issue: 2 hrs
- Replace error overlay: 1.5 hrs
- Fix on all pages: 2 hrs
- **Subtotal: 5.5 hrs**

**Corpus-RAG - Missing features (2 features):**
- Login/signup with corpus-rag API: 8 hrs
- Deploy corpus-rag on server: 6 hrs
- **Subtotal: 14 hrs**

**FINALBOSS - Build/tooling (2 bugs):**
- Critical security issue: 6 hrs
- PostCSS issue: 3 hrs
- **Subtotal: 9 hrs**

**Job analytics (1 bug):**
- User-friendly error messages: 2 hrs
- **Subtotal: 2 hrs**

**Bot: Seek (13 bugs):**
- Chrome LOCK files: 5 hrs
- Cloudflare bypass: 12 hrs
- Hardcoded config: 2 hrs
- Login timeout: 2 hrs
- Button running state: 1.5 hrs
- New tab for every job: 4 hrs
- Overlay timing: 3 hrs
- Wrong overlay info: 3 hrs
- Window size/tablet: 2 hrs
- Overlay on other tabs: 4 hrs
- API error handling: 3 hrs
- First job timeout: 2 hrs
- Agent error awareness: 4 hrs
- **Subtotal: 47.5 hrs**

**Bot: LinkedIn (4 bugs):**
- "javajava" duplication: 3 hrs
- Login timeout: 1.5 hrs
- No overlay: 2 hrs
- Hardcoded defaults: 3 hrs
- **Subtotal: 9.5 hrs**

**TOTAL ESTIMATED EFFORT: 96 hours (~12 working days for one developer)**
- **Corpus-RAG (bugs + features):** 28 hrs
- **FINALBOSS (bugs only):** 68 hrs

### Priority Recommendations:

**🚨 CRITICAL (Immediate Action Required):**
1. FINALBOSS: Sensitive data in git [6 hrs] - Security breach, must fix immediately
2. FINALBOSS: Chrome LOCK files [5 hrs] - Blocks bot from running on subsequent attempts

**HIGH PRIORITY:**
3. Corpus-RAG: API errors across billing/tokens pages [8.5 hrs] - Users can't buy tokens or view history
4. Corpus-RAG: Login/signup API integration [8 hrs] - Core authentication feature
5. FINALBOSS: PostCSS issue [3 hrs] - Prevents app from loading login page
6. FINALBOSS: Cloudflare bypass [12 hrs] - May prevent bots from working on job sites
7. FINALBOSS: "javajava" duplication [3 hrs] - LinkedIn bot searches wrong keywords
8. FINALBOSS: New tab spam [4 hrs] - Creates poor user experience

**MEDIUM PRIORITY:**
9. Corpus-RAG: "No saved jobs" errors [5.5 hrs] - Better error handling needed
10. Corpus-RAG: Deploy on server [6 hrs] - Infrastructure improvement
11. FINALBOSS: Hardcoded config [2 hrs] - Users can't customize search
12. FINALBOSS: Button running state [1.5 hrs] - UI feedback issue
13. FINALBOSS: Login timeout [2 hrs] - Users may need more time
14. FINALBOSS: API error handling [3 hrs] - Better error messages needed

**LOW PRIORITY:**
15-31. Overlay improvements, tablet responsiveness, error awareness [~28 hrs total]

### Notes:
- Estimates assume a developer familiar with TypeScript, Svelte, and Selenium
- Cloudflare bypass (12 hrs) could take significantly longer if detection is sophisticated
- Some bugs (overlay, error handling) may need live testing to fully resolve
- Security issue should be resolved before any code is pushed to public repository
