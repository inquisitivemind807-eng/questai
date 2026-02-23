# Indeed Auto-Apply Bot (TypeScript)

**WARNING:**  
This guide explains how to use this bot. Use at your own risk. Indeed may change their website or introduce new protections (such as captchas or anti-bot measures) at any time, which could break this tool or result in your account being restricted. This is for educational purposes only.

---

## Features

- Automatically finds and applies to jobs on Indeed with "Indeed Apply"
- Uses Camoufox for browser automation (bypasses Cloudflare, Captcha bot)
- Handles multi-step application forms, including resume upload and personal info
- Written in TypeScript with proper type safety
- Modular architecture with separate concerns

## Prerequisites

- Node.js 18.0.0+
- [Camoufox](https://github.com/meteor314/camoufox) installed and configured
- An Indeed account with:
  - Your CV already uploaded
  - Your name, address, and phone number filled in your Indeed profile

---

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the TypeScript code:**
   ```bash
   npm run build
   ```

3. **Edit `config.yaml`:**

   Example:
   ```yaml
   camoufox:
     user_data_dir: "user_data_dir" # by default, no need to change this value
     language: "au"  # or "uk", "de", "fr", etc. make sure to update this value

   search:
     base_url: "https://au.indeed.com/jobs?q=python+developer&l=Sydney"
     start: 0
     end: 20
   ```

   - `user_data_dir`: Path to your Chrome user data directory (to keep your Indeed session).
   - `language`: Your Indeed site language code (e.g., "fr" for France, "uk" for United Kingdom) etc..
   - `base_url`: The Indeed search URL for your job search.
   - `start`/`end`: Pagination range (should be multiples of 10).

4. **How to get your `base_url`:**

   - Go to [Indeed](https://www.indeed.com/) in your browser.
   - Select your search options (job title, location, remote working, type of work, etc.).
   - Click on **Find jobs**.
   - Copy the URL from your browser's address bar.
   - Paste this URL as the value for `base_url` in your `config.yaml`.

5. **Upload your CV to Indeed:**
   - Go to your Indeed profile and upload your CV.
   - Make sure your name, address, and phone number are filled in. 
   - This bot will use this information to apply for jobs. So make sure they are filled in correctly otherwise the bot will not be able to apply for jobs.

---

## First Run

1. **Login to Indeed manually:**
   - Run the bot:
     ```bash
     npm run dev
     # or
     npm start
     ```
   - If not logged in, the bot will open Indeed and prompt you to log in manually.
   - After logging in, close the bot and restart it.

2. **Run the bot again:**
   - The bot will now use your saved session to search and apply for jobs. 
   - All your session data (cookies, login info) will be preserved in the `user_data_dir` specified in `config.yaml`.

---

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

### Watch Mode (for development)
```bash
npm run watch
```

The bot will:
- Visit each search results page.
- Collect all jobs with "Indeed Apply".
- For each job:
  - Open the job page in a new tab.
  - Click "Apply" or "Postuler maintenant".
  - Step through the application wizard, selecting your uploaded CV and clicking "Continue"/"Submit".
  - Log the result in `indeed_apply.log`.

---

## TypeScript Architecture

The TypeScript version is organized into several modules:

### `src/types.ts`
Contains all TypeScript interfaces and type definitions:
- `Config` - Main configuration interface
- `Cookie` - Cookie structure
- `JobCard` - Job card element structure
- `ApplicationResult` - Result of job application
- `Logger` - Logger interface
- Browser and page interfaces

### `src/config.ts`
Configuration loader that:
- Loads and validates YAML configuration
- Provides type-safe access to configuration values
- Validates required fields

### `src/logger.ts`
Logging utility that:
- Implements the Logger interface
- Writes to both console and file
- Formats log messages with timestamps

### `src/indeed_bot.ts`
Main bot class that:
- Manages browser lifecycle
- Handles authentication checking
- Collects job links from search pages
- Applies to jobs through the Indeed wizard
- Provides error handling and logging

---

## Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Run in development mode with ts-node
- `npm start` - Run compiled JavaScript
- `npm run watch` - Watch for changes and recompile

---

## Notes & Limitations

- This bot only works for jobs with "Indeed Apply" (Candidature simplifiée).
- If you encounter captchas or anti-bot protections, this bot should handle them automatically, but you may need to solve them manually.
- Indeed may change their website at any time, which could break this bot.
- Use responsibly and do not spam applications.
- This program is a guide on how to automate job applications, you need to make some modifications to the code to make it work for your needs.

---

## Differences from Python Version

### Improvements:
1. **Type Safety**: Full TypeScript typing prevents runtime errors
2. **Modular Architecture**: Separated concerns into different modules
3. **Better Error Handling**: More robust error handling with proper types
4. **Modern JavaScript**: Uses async/await throughout
5. **Configuration Validation**: Validates config on startup
6. **Logging System**: Structured logging with file output

### Features:
- Same core functionality as Python version
- Updated authentication detection for current Indeed auth system
- Robust job detection with multiple fallback selectors
- Multi-language support for apply buttons
- Application wizard automation with timeout handling

---

## Troubleshooting

### Common Issues:

1. **"Token not found"**: Make sure you're logged into Indeed in the browser session
2. **No jobs found**: Check your search URL and ensure it's correct
3. **Browser crashes**: The bot includes better error handling to prevent crashes
4. **Compilation errors**: Make sure all dependencies are installed with `npm install`

### Debug Mode:
Set environment variable for more verbose logging:
```bash
DEBUG=* npm run dev
```
