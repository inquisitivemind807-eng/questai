import { Builder, WebDriver } from 'selenium-webdriver';
import { Options } from 'selenium-webdriver/chrome';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BotConfig {
  formData: {
    enableDeepSeek: boolean;
    deepSeekApiKey: string;
    acceptTerms: boolean;
  };
}

const makeDirectories = (dirs: string[]) => {
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

const findDefaultProfileDirectory = (): string | null => {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) return null;

  const profilePaths = [
    path.join(homeDir, '.config/google-chrome/Default'),
    path.join(homeDir, 'Library/Application Support/Google/Chrome/Default'),
    path.join(homeDir, 'AppData/Local/Google/Chrome/User Data/Default')
  ];

  for (const profilePath of profilePaths) {
    if (fs.existsSync(profilePath)) {
      return path.dirname(profilePath);
    }
  }
  return null;
};

const printLog = (message: string) => {
  console.log(message);
};

/**
 * Check if driver session is valid and ready for use
 * Returns true if driver is ready, false if session is invalid
 */
export async function isDriverReady(driver: WebDriver): Promise<boolean> {
  try {
    await driver.getCurrentUrl();
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('session') || errorMsg.includes('session ID') || errorMsg.includes('quit')) {
      return false;
    }
    // Other errors might be transient, assume ready
    return true;
  }
}

// Kill all Chrome processes spawned by this bot
export const killAllChromeProcesses = async (): Promise<void> => {
  printLog("🔥 Emergency: Killing all Chrome processes...");

  try {
    const platform = process.platform;

    if (platform === 'linux' || platform === 'darwin') {
      // Unix-based systems
      const { execSync } = await import('child_process');

      // Kill all chrome processes owned by current user
      try {
        execSync('pkill -9 chrome', { stdio: 'ignore' });
        execSync('pkill -9 chromium', { stdio: 'ignore' });
        printLog("✅ Chrome processes killed");
      } catch (e) {
        // Process might not exist, that's ok
        printLog("⚠️ No Chrome processes to kill or insufficient permissions");
      }
    } else if (platform === 'win32') {
      // Windows
      const { execSync } = await import('child_process');

      try {
        execSync('taskkill /F /IM chrome.exe /T', { stdio: 'ignore' });
        printLog("✅ Chrome processes killed");
      } catch (e) {
        printLog("⚠️ No Chrome processes to kill or insufficient permissions");
      }
    }
  } catch (error) {
    printLog(`❌ Failed to kill Chrome processes: ${error}`);
  }
};

// Monitor browser windows and detect manual closure
export const monitorBrowserClose = (driver: WebDriver, onBrowserClosed?: () => void): (() => void) => {
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 5; // Require 5 consecutive errors (10 seconds) before shutdown
  let isWindowOperationInProgress = false; // Flag to ignore errors during window operations
  const INITIALIZATION_GRACE_PERIOD_MS = 20000; // 20 seconds grace period after driver creation
  const monitoringStartTime = Date.now(); // When monitoring function is created
  let actualCheckStartTime: number | null = null; // When checks actually start
  let recoveryAttempted = false; // Track if we've already attempted recovery

  // Expose function to temporarily disable monitoring during window operations
  // Store these functions on the driver so they're always available
  const disableMonitoring = () => {
    isWindowOperationInProgress = true;
    printLog("🔇 Browser monitoring temporarily disabled for window operation");
  };

  const enableMonitoring = () => {
    isWindowOperationInProgress = false;
    consecutiveErrors = 0; // Reset error count after window operation
    printLog("🔊 Browser monitoring re-enabled");
  };

  // Attach to driver object for external access
  (driver as any).__disableBrowserMonitoring = disableMonitoring;
  (driver as any).__enableBrowserMonitoring = enableMonitoring;

  // Delay the start of monitoring checks to allow driver to fully initialize
  // The interval will start after INITIALIZATION_GRACE_PERIOD_MS
  let checkInterval: NodeJS.Timeout | null = null;
  
  // Define the check function
  const performCheck = async () => {
    // Skip check if window operation is in progress
    if (isWindowOperationInProgress) {
      return;
    }
    
    // Skip check if workflow has completed (browser might be closing)
    if ((driver as any).__workflowCompleted) {
      return;
    }

    // Track when checks actually start (first check)
    if (actualCheckStartTime === null) {
      actualCheckStartTime = Date.now();
      printLog(`🔍 Browser monitoring checks started (${Math.round((actualCheckStartTime - monitoringStartTime) / 1000)}s after driver creation)`);
    }

    // During initialization grace period, be more lenient with errors
    // Use time since checks actually started, not since function was created
    const timeSinceCheckStart = actualCheckStartTime ? Date.now() - actualCheckStartTime : Date.now() - monitoringStartTime;
    const isInitializationPeriod = timeSinceCheckStart < INITIALIZATION_GRACE_PERIOD_MS;

    try {
      const handles = await driver.getAllWindowHandles();
      consecutiveErrors = 0; // Reset on successful check
      
      if (handles.length === 0) {
        printLog("Browser manually closed by user - shutting down bot");
        if (checkInterval) clearInterval(checkInterval);
        if (onBrowserClosed) {
          onBrowserClosed();
        } else {
          process.exit(0);
        }
      }
    } catch (error) {
      consecutiveErrors++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      const isSessionError = errorMsg.includes('session') || errorMsg.includes('session ID') || errorMsg.includes('quit');
      
      // During initialization, session errors are expected and should be ignored
      if (isInitializationPeriod && isSessionError) {
        // Don't count initialization errors - driver might still be setting up
        printLog(`⏳ Ignoring session error during initialization (${Math.round(timeSinceCheckStart/1000)}s since checks started): ${errorMsg.substring(0, 100)}`);
        consecutiveErrors = 0; // Reset counter for initialization errors
        return;
      }
      
      // Only shutdown if we have multiple consecutive errors (not just a transient error)
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        // Double-check if session is actually invalid or just transient
        try {
          // Try a simple operation to verify session is really dead
          await driver.getCurrentUrl();
          // If we get here, session is actually valid - reset error count
          printLog("✅ Session is actually valid - resetting error count");
          consecutiveErrors = 0;
          return;
        } catch (verifyError) {
          // Session is really dead - try recovery first
          if (!recoveryAttempted) {
            recoveryAttempted = true;
            printLog(`🔄 Browser connection lost (${consecutiveErrors} consecutive errors) - attempting driver recovery...`);
            printLog(`Last error: ${errorMsg}`);
            
            // Check if recovery callback is available
            const recoveryCallback = (driver as any).__recoverDriver;
            if (typeof recoveryCallback === 'function') {
              printLog("🔧 Recovery callback found - attempting to recreate driver...");
              try {
                const recovered = await recoveryCallback();
                if (recovered) {
                  printLog("✅ Driver recovery successful - resetting error count");
                  consecutiveErrors = 0;
                  recoveryAttempted = false; // Allow future recovery attempts
                  return;
                } else {
                  printLog("❌ Driver recovery failed");
                }
              } catch (recoveryError) {
                printLog(`❌ Driver recovery error: ${recoveryError}`);
              }
            } else {
              printLog("⚠️ No recovery callback available - workflow will handle recovery");
              // Don't shutdown - let workflow steps handle it
              consecutiveErrors = 0; // Reset to allow workflow to try recovery
              recoveryAttempted = false;
              return;
            }
          }
          
          // Recovery failed or not available - check if browser was manually closed
          try {
            const remainingHandles = await driver.getAllWindowHandles();
            if (remainingHandles.length === 0) {
              printLog("Browser manually closed by user - shutting down bot");
              if (checkInterval) clearInterval(checkInterval);
              if (onBrowserClosed) {
                onBrowserClosed();
              } else {
                process.exit(0);
              }
            } else {
              // Session invalid but windows exist - let workflow handle it
              printLog("⚠️ Session invalid but windows exist - workflow will handle recovery");
              consecutiveErrors = 0; // Reset to allow workflow to try recovery
              recoveryAttempted = false;
            }
          } catch (finalCheckError) {
            // Can't check handles - assume workflow will handle recovery
            printLog("⚠️ Cannot verify window state - workflow will handle recovery");
            consecutiveErrors = 0;
            recoveryAttempted = false;
          }
        }
      } else {
        // Log but don't shutdown on first/second error (might be transient)
        if (isInitializationPeriod) {
          printLog(`⏳ Browser check error during initialization (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${errorMsg.substring(0, 100)}`);
        } else {
          printLog(`⚠️ Browser check error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${errorMsg.substring(0, 100)}`);
        }
      }
    }
  };
  
  // Start monitoring after grace period
  // This delay ensures driver is fully initialized before we start checking
  setTimeout(() => {
    if (checkInterval) return; // Already started
    
    const timeElapsed = Math.round((Date.now() - monitoringStartTime) / 1000);
    printLog(`🔍 Starting browser monitoring checks (${timeElapsed}s after driver creation)`);
    checkInterval = setInterval(performCheck, 2000); // Check every 2 seconds
  }, INITIALIZATION_GRACE_PERIOD_MS);

  // Return function to stop monitoring
  return () => {
    if (checkInterval) {
      clearInterval(checkInterval);
    }
  };
};

/**
 * Cleans stale Chrome LOCK files from a session directory.
 * Only removes LOCK files older than 1 hour to prevent removing active locks.
 *
 * @param sessionDir - The Chrome user-data-dir path
 */
const cleanStaleLockFiles = (sessionDir: string): void => {
  try {
    printLog(`Checking for stale LOCK files in: ${sessionDir}`);

    // Recursively find all LOCK files in the session directory
    const files = fs.readdirSync(sessionDir, { recursive: true, withFileTypes: true });
    const lockFiles = files
      .filter(file => file.isFile() && file.name === 'LOCK')
      .map(file => path.join(file.path || file.parentPath || sessionDir, file.name));

    if (lockFiles.length === 0) {
      printLog('No LOCK files found - clean session');
      return;
    }

    printLog(`Found ${lockFiles.length} LOCK files, checking staleness...`);

    const ONE_HOUR_MS = 60 * 60 * 1000;
    const now = Date.now();
    let removedCount = 0;
    let skippedCount = 0;

    for (const lockFile of lockFiles) {
      try {
        const stats = fs.statSync(lockFile);
        const ageMs = now - stats.mtimeMs;

        // Only remove LOCK files older than 1 hour (safety margin)
        if (ageMs > ONE_HOUR_MS) {
          fs.unlinkSync(lockFile);
          removedCount++;
          printLog(`  Removed stale LOCK (${Math.round(ageMs / 1000 / 60)} min old): ${path.relative(sessionDir, lockFile)}`);
        } else {
          skippedCount++;
          printLog(`  Skipped recent LOCK (${Math.round(ageMs / 1000 / 60)} min old): ${path.relative(sessionDir, lockFile)}`);
        }
      } catch (err) {
        // File might have been deleted by another process, or permission issue
        printLog(`  Could not process LOCK: ${path.relative(sessionDir, lockFile)} - ${err}`);
      }
    }

    if (removedCount > 0) {
      printLog(`✓ Cleanup complete: removed ${removedCount} stale LOCK files`);
    }
    if (skippedCount > 0) {
      printLog(`Kept ${skippedCount} recent LOCK files (< 1 hour old)`);
    }
  } catch (error) {
    // Don't fail bot startup if cleanup fails
    printLog(`Warning: LOCK cleanup failed (continuing anyway): ${error}`);
  }
};

export const setupChromeDriver = async (botName: string = 'seek'): Promise<{ driver: WebDriver; actions: any; sessionExists: boolean; sessionsDir: string; stopMonitoring?: () => void }> => {
  try {
    const configPath = path.join(__dirname, '../user-bots-config.json');
    const config: BotConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // Create session management like botrunner.ts
    const sessionsDir = path.join(process.cwd(), 'sessions', botName);
    const screenshotsDir = path.join(sessionsDir, 'screenshots');
    const logsDir = path.join(sessionsDir, 'logs');
    const resumeDir = path.join(sessionsDir, 'resume');
    const tempDir = path.join(sessionsDir, 'temp');

    makeDirectories([sessionsDir, screenshotsDir, logsDir, resumeDir, tempDir]);

    // Clean stale LOCK files before checking session
    cleanStaleLockFiles(sessionsDir);

    // Check if session exists (has saved data)
    const sessionExists = fs.readdirSync(sessionsDir).filter(file =>
      !['screenshots', 'logs', 'resume', 'temp'].includes(file)
    ).length > 0;

    const options = new Options();

    // CRITICAL: Enable CDP explicitly (Chrome 144+ requirement)
    // Without this, Runtime.evaluate and all executeScript() calls fail
    options.addArguments('--remote-debugging-port=9222');
    printLog('🔍 Enabled Chrome DevTools Protocol on port 9222');

    // Wayland support for Linux (Sway/GNOME Wayland/etc.)
    if (process.platform === 'linux') {
      // Check if running on Wayland
      const isWayland = process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland';

      if (isWayland) {
        printLog('🔍 Detected Wayland session - configuring Chrome for Wayland');
        options.addArguments('--ozone-platform=wayland');
        options.addArguments('--enable-features=UseOzonePlatform,WaylandWindowDecorations');
      } else {
        printLog('🔍 Detected X11 session');
      }
    }

    const runInBackground = process.env.HEADLESS === 'true';
    const disableExtensions = process.env.DISABLE_EXTENSIONS === 'true';
    const safeMode = process.env.SAFE_MODE === 'true';
    const useRealProfile = process.env.USE_REAL_CHROME === 'true';

    // STEALTH MODE: Minimal flags to avoid detection
    if (!runInBackground) {
      // Only add essential flags for non-headless
      options.addArguments('--no-sandbox');
      options.addArguments('--disable-dev-shm-usage');
    } else {
      // Headless mode (easier to detect)
      options.addArguments('--headless=new');
      options.addArguments('--no-sandbox');
      options.addArguments('--disable-dev-shm-usage');
      options.addArguments('--disable-gpu');
    }

    if (disableExtensions) {
      options.addArguments('--disable-extensions');
    }

    // CRITICAL: Use real Chrome profile to avoid Cloudflare detection
    if (useRealProfile) {
      const realChromeProfile = findDefaultProfileDirectory();
      if (realChromeProfile) {
        // IMPORTANT: Use a COPY of the profile to avoid locking issues
        // Chrome can't use same profile in multiple instances
        const profileCopyDir = path.join(sessionsDir, 'chrome-profile-copy');

        printLog(`🔥 STEALTH MODE: Copying your real Chrome profile...`);
        printLog(`   From: ${realChromeProfile}`);
        printLog(`   To: ${profileCopyDir}`);

        // Copy profile if it doesn't exist
        if (!fs.existsSync(profileCopyDir)) {
          try {
            // Copy the Default profile directory
            const sourceProfile = path.join(realChromeProfile, 'Default');
            const targetProfile = path.join(profileCopyDir, 'Default');

            if (fs.existsSync(sourceProfile)) {
              fs.mkdirSync(targetProfile, { recursive: true });

              // Copy only essential files for stealth (cookies, preferences)
              const essentialFiles = ['Cookies', 'Preferences', 'Local Storage', 'History'];
              for (const file of essentialFiles) {
                const sourcePath = path.join(sourceProfile, file);
                const targetPath = path.join(targetProfile, file);

                if (fs.existsSync(sourcePath)) {
                  try {
                    if (fs.lstatSync(sourcePath).isDirectory()) {
                      fs.cpSync(sourcePath, targetPath, { recursive: true });
                    } else {
                      fs.cpSync(sourcePath, targetPath);
                    }
                    printLog(`   ✓ Copied ${file}`);
                  } catch (copyError) {
                    printLog(`   ⚠️ Could not copy ${file}: ${copyError}`);
                  }
                }
              }

              printLog(`✅ Profile copied successfully`);
            }
          } catch (error) {
            printLog(`⚠️ Profile copy failed: ${error}`);
            printLog(`⚠️ Using fresh bot session instead`);
          }
        } else {
          printLog(`✅ Using existing profile copy`);
        }

        options.addArguments(`--user-data-dir=${profileCopyDir}`);
        options.addArguments('--profile-directory=Default');
      } else {
        printLog('⚠️ Could not find real Chrome profile, using bot session instead');
        options.addArguments(`--user-data-dir=${sessionsDir}`);
      }
    } else if (safeMode) {
      printLog('SAFE MODE: Will login with a guest profile, browsing history will not be saved in the browser!');
    } else {
      // Use the session directory for Chrome profile (like botrunner.ts)
      options.addArguments(`--user-data-dir=${sessionsDir}`);
      if (sessionExists) {
        printLog(`Using existing session: ${sessionsDir}`);
      } else {
        printLog(`Creating new session: ${sessionsDir}`);
      }
    }

    // STEALTH: Exclude automation switches that Cloudflare detects
    options.excludeSwitches('enable-automation', 'enable-logging');

    // STEALTH: Add arguments to look like a normal user
    options.addArguments('--disable-blink-features=AutomationControlled');

    // Selenium Manager will automatically download the correct ChromeDriver version
    // for the user's Chrome browser - no manual chromedriver package needed!
    const driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    // Try to maximize window (may fail on Wayland)
    try {
      await driver.manage().window().maximize();
      printLog("✅ Window maximized");
    } catch (maximizeError) {
      printLog(`⚠️ Maximize failed (${maximizeError.message}), using fallback`);
      // Fallback: Set window size manually
      try {
        await driver.manage().window().setRect({ width: 1920, height: 1080, x: 0, y: 0 });
        printLog("✅ Window resized to 1920x1080");
      } catch (resizeError) {
        printLog(`⚠️ Resize also failed (continuing anyway): ${resizeError.message}`);
        // Continue anyway - window size is not critical
      }
    }

    const actions = driver.actions();

    // CRITICAL: Wait for driver to be fully ready before starting monitoring
    // Give driver time to complete window maximize and initial setup
    printLog("⏳ Waiting for driver to fully initialize...");
    await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second initial wait
    
    // Verify driver is ready
    try {
      await driver.getCurrentUrl();
      printLog("✅ Driver session is ready");
    } catch (sessionError) {
      const errorMsg = sessionError instanceof Error ? sessionError.message : String(sessionError);
      printLog(`⚠️ Driver session check warning: ${errorMsg.substring(0, 100)}`);
      // Continue anyway - might be transient
    }

    // Start monitoring for manual browser closure
    // Monitoring will start after a grace period to allow driver to fully initialize
    const stopMonitoring = monitorBrowserClose(driver);
    printLog("⏳ Browser monitoring will start after initialization period (20 seconds)");

    return { driver, actions, sessionExists, sessionsDir, stopMonitoring };

  } catch (error) {
    const errorMessage = 'Seems like either... \n\n1. Chrome is already running. \nA. Close all Chrome windows and try again. \n\n2. Google Chrome or Chromedriver is out dated. \nA. Update browser and Chromedriver! \n\n3. Chrome not installed or not in PATH. \nA. Install Chrome and ensure chromedriver is in PATH. \n\nPlease check GitHub discussions/support for solutions';

    printLog(errorMessage);
    console.error('Error in opening Chrome:', error);

    throw error;
  }
};

