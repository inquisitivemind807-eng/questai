/**
 * Universal Core Configuration for All Bots
 *
 * This file contains all the shared configuration interfaces and defaults
 * that can be used across different bot implementations. Each bot can
 * inherit from these defaults and override specific values as needed.
 *
 * Configuration is organized into logical sections:
 * - Browser Settings: Chrome/WebDriver configuration
 * - Timeouts: Wait times for various operations
 * - Retry Logic: How to handle failures and retries
 * - Humanization: Human-like behavior simulation
 * - Session Management: Persistent browser sessions
 * - Error Handling: Screenshot, logging, and error recovery
 */

/**
 * Browser Settings Interface
 * Controls Chrome WebDriver configuration and window properties
 */
export interface BrowserSettings {
  /** Run browser in headless mode (no UI) */
  headless: boolean;

  /** Browser window dimensions */
  window_size: {
    width: number;
    height: number;
  };

  /** Custom user agent string (optional) */
  user_agent?: string;

  /** Page viewport dimensions (optional) */
  viewport?: {
    width: number;
    height: number;
  };
}

/**
 * Timeout Settings Interface
 * All timeouts are specified in seconds
 */
export interface TimeoutSettings {
  /** Maximum time to wait for page loads */
  page_load: number;

  /** Maximum time to wait for elements to appear */
  element_wait: number;

  /** Maximum time to wait for navigation events */
  navigation: number;

  /** Maximum time to wait for manual login completion */
  login_wait: number;

  /** Maximum time to wait for search operations */
  search_execution: number;
}

/**
 * Retry Settings Interface
 * Controls automatic retry behavior on failures
 */
export interface RetrySettings {
  /** Maximum number of retry attempts */
  max_retries: number;

  /** Base delay between retries (seconds) */
  retry_delay: number;

  /** Use exponential backoff for retry delays */
  exponential_backoff: boolean;
}

/**
 * Humanization Settings Interface
 * Controls human-like behavior simulation to avoid detection
 */
export interface HumanizationSettings {
  /** Random delay range for mouse clicks (milliseconds) */
  click_delay: {
    min: number;
    max: number;
  };

  /** Random typing speed range (milliseconds per character) */
  typing_speed: {
    min: number;
    max: number;
  };

  /** Random thinking pause range (milliseconds) */
  thinking_pause: {
    min: number;
    max: number;
  };

  /** Enable random mouse movements */
  random_mouse_movement: boolean;

  /** Enable smooth scrolling animations */
  smooth_scrolling: boolean;
}

/**
 * Session Settings Interface
 * Controls browser session persistence and management
 */
export interface SessionSettings {
  /** Save and restore browser sessions between runs */
  persist_session: boolean;

  /** Session timeout in seconds */
  session_timeout: number;

  /** Automatically clean up old session files */
  auto_cleanup: boolean;
}

/**
 * Error Handling Settings Interface
 * Controls error recovery and debugging features
 */
export interface ErrorHandlingSettings {
  /** Take screenshots when errors occur */
  screenshot_on_error: boolean;

  /** Continue execution after recoverable errors */
  continue_on_error: boolean;

  /** Logging level for console output */
  log_level: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Main Core Bot Configuration Interface
 * Combines all configuration sections into a single interface
 */
export interface CoreBotConfiguration {
  browser_settings: BrowserSettings;
  timeouts: TimeoutSettings;
  retry_settings: RetrySettings;
  humanization: HumanizationSettings;
  session_settings: SessionSettings;
  error_handling: ErrorHandlingSettings;
}

/**
 * Default Core Configuration
 *
 * These are the recommended default values for all bot configurations.
 * Individual bots can override any of these values by importing this
 * configuration and merging with their custom settings.
 *
 * Usage:
 *   import { default_core_config, CoreConfigHelper } from './core_configurations';
 *   const my_config = CoreConfigHelper.merge_config({
 *     browser_settings: { headless: true }
 *   });
 */
export const default_core_config: CoreBotConfiguration = {
  // ═════════════════════════════════════════════════════════════════════════
  // Browser Settings
  // ═════════════════════════════════════════════════════════════════════════
  browser_settings: {
    headless: false,                    // Show browser window for debugging
    window_size: {
      width: 1920,                      // Full HD width
      height: 1080                      // Full HD height
    },
    viewport: {
      width: 1920,                      // Viewport width (matches window)
      height: 950                       // Viewport height (accounting for browser chrome)
    }
  },

  // ═════════════════════════════════════════════════════════════════════════
  // Timeout Settings (all values in seconds)
  // ═════════════════════════════════════════════════════════════════════════
  timeouts: {
    page_load: 30,                      // Wait up to 30s for pages to load
    element_wait: 15,                   // Wait up to 15s for elements to appear
    navigation: 20,                     // Wait up to 20s for navigation events
    login_wait: 300,                    // Wait up to 5 minutes for manual login
    search_execution: 60                // Wait up to 1 minute for search operations
  },

  // ═════════════════════════════════════════════════════════════════════════
  // Retry Settings
  // ═════════════════════════════════════════════════════════════════════════
  retry_settings: {
    max_retries: 3,                     // Retry failed operations 3 times
    retry_delay: 2,                     // Wait 2 seconds between retries
    exponential_backoff: true           // Increase delay exponentially (2s, 4s, 8s)
  },

  // ═════════════════════════════════════════════════════════════════════════
  // Humanization Settings (all values in milliseconds)
  // ═════════════════════════════════════════════════════════════════════════
  humanization: {
    click_delay: {
      min: 500,                         // Minimum 0.5s delay before clicks
      max: 1500                         // Maximum 1.5s delay before clicks
    },
    typing_speed: {
      min: 50,                          // Minimum 50ms between keystrokes
      max: 150                          // Maximum 150ms between keystrokes
    },
    thinking_pause: {
      min: 1000,                        // Minimum 1s thinking pause
      max: 3000                         // Maximum 3s thinking pause
    },
    random_mouse_movement: true,        // Enable random mouse movements
    smooth_scrolling: true              // Enable smooth scrolling animations
  },

  // ═════════════════════════════════════════════════════════════════════════
  // Session Settings
  // ═════════════════════════════════════════════════════════════════════════
  session_settings: {
    persist_session: true,              // Save browser sessions between runs
    session_timeout: 3600,              // Session expires after 1 hour (3600s)
    auto_cleanup: false                 // Keep old sessions for debugging
  },

  // ═════════════════════════════════════════════════════════════════════════
  // Error Handling Settings
  // ═════════════════════════════════════════════════════════════════════════
  error_handling: {
    screenshot_on_error: true,          // Take screenshots when errors occur
    continue_on_error: false,           // Stop execution on errors (safe mode)
    log_level: 'info'                   // Show info, warn, and error logs
  }
};

/**
 * Core Configuration Helper Class
 *
 * Provides utility functions for working with bot configurations,
 * including merging custom settings with defaults and converting
 * values between different units.
 */
export class CoreConfigHelper {
  /**
   * Merge user configuration with default settings
   *
   * This function performs a deep merge of user-provided configuration
   * with the default core configuration. User settings override defaults
   * but missing values are filled in from defaults.
   *
   * @param user_config - Partial configuration object to merge
   * @returns Complete configuration with user overrides applied
   */
  static merge_config(user_config: Partial<CoreBotConfiguration> = {}): CoreBotConfiguration {
    return {
      ...default_core_config,
      ...user_config,
      browser_settings: {
        ...default_core_config.browser_settings,
        ...user_config.browser_settings
      },
      timeouts: {
        ...default_core_config.timeouts,
        ...user_config.timeouts
      },
      retry_settings: {
        ...default_core_config.retry_settings,
        ...user_config.retry_settings
      },
      humanization: {
        ...default_core_config.humanization,
        ...user_config.humanization
      },
      session_settings: {
        ...default_core_config.session_settings,
        ...user_config.session_settings
      },
      error_handling: {
        ...default_core_config.error_handling,
        ...user_config.error_handling
      }
    };
  }

  /**
   * Convert timeout from seconds to milliseconds
   *
   * WebDriver and many JavaScript functions expect timeouts in milliseconds,
   * but our configuration uses seconds for readability.
   *
   * @param config - The bot configuration object
   * @param timeout_key - Which timeout value to convert
   * @returns Timeout value in milliseconds
   */
  static get_timeout_ms(config: CoreBotConfiguration, timeout_key: keyof CoreBotConfiguration['timeouts']): number {
    return config.timeouts[timeout_key] * 1000;
  }

  /**
   * Get random delay for humanization
   *
   * Returns a random value between the min and max range for the
   * specified delay type. Used to make bot behavior appear more human.
   *
   * @param config - The bot configuration object
   * @param delay_type - Which type of delay to generate
   * @returns Random delay value in milliseconds
   */
  static get_random_delay(config: CoreBotConfiguration, delay_type: 'click_delay' | 'typing_speed' | 'thinking_pause'): number {
    const delay_config = config.humanization[delay_type];
    return Math.random() * (delay_config.max - delay_config.min) + delay_config.min;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Exports
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Default export: the core configuration object
 * Use this when you want the default settings without modification
 */
export default default_core_config;