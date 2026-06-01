/**
 * Bot Registry — Auto-Discovery & Validation
 * ------------------------------------------------------------------
 * Scans the `src/bots/` directory tree for platform bot folders
 * (seek/, linkedin/, indeed/). Each folder is validated by checking
 * for the three required artifacts:
 *
 *   1. `{bot}_impl.ts`     — the step function implementations
 *   2. `*_steps.yaml`      — workflow definitions (one or more)
 *   3. `{bot}_selectors.json` — DOM selector maps
 *
 * YAML variants (e.g. `seek_apply_steps.yaml`, `seek_extract_steps.yaml`)
 * are each registered as a first-class bot name (`seek_apply`, `seek_extract`).
 * All variants share the same impl + selectors + config.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BotInfo {
  name: string;
  display_name: string;
  description: string;
  yaml_path: string;
  impl_path: string;
  config_path: string;
  selectors_path: string;
}

export class BotRegistry {
  private bots_dir: string;
  private discovered_bots: Map<string, BotInfo> = new Map();

  /** @param bots_dir - Root directory to scan; defaults to `src/bots/`. */
  constructor(bots_dir?: string) {
    this.bots_dir = bots_dir || path.join(__dirname, '..');
  }

  /**
   * Scan the bots directory and register all discovered bots + variants.
   * Returns an array of bot name strings (e.g. ['seek', 'seek_apply', 'linkedin']).
   * Skips dot-directories and well-known non-bot folders (core, sessions, logs, etc.).
   */
  discover_bots(): string[] {
    const bot_names: string[] = [];

    try {
      const entries = fs.readdirSync(this.bots_dir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip non-bot directories: core, sessions, and data folders
        const skipDirs = ['core', 'sessions', 'all-resumes', 'jobs', 'logs', 'data'];

        if (entry.isDirectory() && !entry.name.startsWith('.') && !skipDirs.includes(entry.name)) {
          const bot_name = entry.name;
          const bot_path = path.join(this.bots_dir, bot_name);

          if (this.validate_bot_structure(bot_name, bot_path)) {
            // Discover all YAML workflow variants in this folder
            const variants = this.discover_yaml_variants(bot_name, bot_path);

            for (const [variant_name, yaml_path] of variants) {
              bot_names.push(variant_name);
              this.discovered_bots.set(variant_name, this.create_bot_info(variant_name, bot_name, bot_path, yaml_path));
            }
          }
        }
      }
    } catch (error) {
      // console.error(`Error discovering bots: ${error}`);
    }

    // console.log(`[DEV] [Registry] Discovered bots: ${bot_names.join(', ')}`);
    return bot_names;
  }

  /**
   * Internal: scan a single bot folder for YAML workflow variants.
   * Returns a Map of variant_name → yaml_path.
   * The base bot name (e.g. 'seek') maps to the default YAML;
   * other variants get names like 'seek_apply'.
   */
  private discover_yaml_variants(bot_name: string, bot_path: string): Map<string, string> {
    const variants = new Map<string, string>();

    try {
      const files = fs.readdirSync(bot_path);
      const yaml_files = files.filter(f => f.endsWith('_steps.yaml'));

      if (yaml_files.length === 0) {
        return variants;
      }

      // Determine which YAML is the default for the base bot name.
      // Priority: {bot_name}_steps.yaml → {bot_name}_extract_steps.yaml → first available.
      const default_yaml = this.resolve_default_yaml(bot_name, yaml_files);

      // Register the base bot name with the default YAML
      if (default_yaml) {
        variants.set(bot_name, path.join(bot_path, default_yaml));
      }

      // Register each YAML as a variant name.
      // E.g. seek_apply_steps.yaml → variant name "seek_apply"
      for (const yaml_file of yaml_files) {
        const variant_name = yaml_file.replace('_steps.yaml', '');
        if (variant_name !== bot_name) {
          variants.set(variant_name, path.join(bot_path, yaml_file));
        }
      }
    } catch (error) {
      console.error(`[Registry] Error scanning YAML variants in '${bot_name}': ${error}`);
    }

    return variants;
  }

  /**
   * Pick the default YAML for a bot folder.
   * Priority: `{bot}_steps.yaml` → `{bot}_extract_steps.yaml` → first available.
   */
  private resolve_default_yaml(bot_name: string, yaml_files: string[]): string | null {
    // First choice: {bot_name}_steps.yaml (e.g. linkedin_steps.yaml)
    const exact = `${bot_name}_steps.yaml`;
    if (yaml_files.includes(exact)) return exact;

    // Second choice: {bot_name}_extract_steps.yaml (e.g. seek_extract_steps.yaml)
    const extract = `${bot_name}_extract_steps.yaml`;
    if (yaml_files.includes(extract)) return extract;

    // Fallback: first available
    return yaml_files[0] || null;
  }

  /**
   * Validate that a bot folder has all required files:
   * `{bot}_impl.ts`, at least one `*_steps.yaml`, and `{bot}_selectors.json`.
   */
  private validate_bot_structure(bot_name: string, bot_path: string): boolean {
    // Check impl file
    const impl_path = path.join(bot_path, `${bot_name}_impl.ts`);
    if (!fs.existsSync(impl_path)) {
      // console.warn(`[Registry] Bot '${bot_name}' missing required file: ${bot_name}_impl.ts`);
      return false;
    }

    // Check for at least one *_steps.yaml
    try {
      const files = fs.readdirSync(bot_path);
      const has_yaml = files.some(f => f.endsWith('_steps.yaml'));
      if (!has_yaml) {
        // console.warn(`[Registry] Bot '${bot_name}' has no *_steps.yaml workflow files`);
        return false;
      }
    } catch {
      return false;
    }

    // Check for selectors.json either in root or config/ subdirectory
    const selectors_root = path.join(bot_path, `${bot_name}_selectors.json`);
    const selectors_config = path.join(bot_path, 'config', `${bot_name}_selectors.json`);
    if (!fs.existsSync(selectors_root) && !fs.existsSync(selectors_config)) {
      // console.warn(`[Registry] Bot '${bot_name}' missing required file: ${bot_name}_selectors.json (checked root and config/)`);
      return false;
    }

    return true;
  }

  /**
   * Build the BotInfo record for a discovered variant.
   * Variant name may differ from bot folder name
   * (e.g. variant 'seek_apply' in folder 'seek').
   */
  private create_bot_info(variant_name: string, bot_name: string, bot_path: string, yaml_path: string): BotInfo {
    // Check if selectors file is in config/ subdirectory
    const selectors_root = path.join(bot_path, `${bot_name}_selectors.json`);
    const selectors_config = path.join(bot_path, 'config', `${bot_name}_selectors.json`);
    const selectors_path = fs.existsSync(selectors_config) ? selectors_config : selectors_root;

    return {
      name: variant_name,
      display_name: this.format_display_name(variant_name),
      description: `Automation bot for ${this.format_display_name(variant_name)}`,
      yaml_path,
      impl_path: path.join(bot_path, `${bot_name}_impl.ts`),
      config_path: path.join(bot_path, `${bot_name}_configuration.ts`),
      selectors_path: selectors_path
    };
  }

  /** Capitalize the first letter for display purposes. */
  private format_display_name(bot_name: string): string {
    return bot_name.charAt(0).toUpperCase() + bot_name.slice(1);
  }

  /** Get info for a specific bot by name; null if not registered. */
  get_bot_info(bot_name: string): BotInfo | null {
    return this.discovered_bots.get(bot_name) || null;
  }

  /** Returns all discovered bot variants. */
  get_all_bots(): BotInfo[] {
    return Array.from(this.discovered_bots.values());
  }

  /**
   * Load the bot's user configuration JSON.
   * Tries the bot-specific config file first, then falls back to
   * the shared `user-bots-config.json`. Returns a default config
   * if nothing is found.
   */
  load_bot_config(bot_name: string): any {
    const bot_info = this.get_bot_info(bot_name);
    if (!bot_info) {
      throw new Error(`Bot '${bot_name}' not found in registry`);
    }

    try {
      // Try bot-specific config first
      if (fs.existsSync(bot_info.config_path)) {
        const config_module = require(bot_info.config_path);
        return config_module.default || config_module;
      } else {
        // Use core user config as fallback
        const core_config_path = path.join(__dirname, '../user-bots-config.json');
        if (fs.existsSync(core_config_path)) {
          console.log(`[DEV] [Registry] Using core configuration for '${bot_name}'`);
          return JSON.parse(fs.readFileSync(core_config_path, 'utf8'));
        } else {
          console.warn(`[Registry] Configuration file not found for '${bot_name}', using defaults`);
          // Return default structure similar to user-bots-config.json
          return {
            formData: {
              fullName: "",
              email: "",
              phone: "",
              linkedinUrl: "",
              keywords: "",
              locations: "",
              minSalary: "",
              maxSalary: "",
              jobType: "any",
              experienceLevel: "any",
              industry: "",
              listedDate: "",
              remotePreference: "any",
              rightToWork: "citizen",
              rewriteResume: false,
              excludedCompanies: "",
              excludedKeywords: "",
              skillWeight: "0.4",
              locationWeight: "0.2",
              salaryWeight: "0.3",
              companyWeight: "0.1",
              enableDeepSeek: false,
              deepSeekApiKey: "",
              acceptTerms: false,
              resumeFileName: "",
              botMode: "superbot"
            },
            industries: [],
            workRightOptions: []
          };
        }
      }
    } catch (error) {

      console.error(`[Registry] Error loading config for '${bot_name}': ${error}`);
      return {};
    }
  }

  /** Load and parse the bot's selectors JSON file. */
  load_bot_selectors(bot_name: string): any {
    const bot_info = this.get_bot_info(bot_name);
    if (!bot_info) {
      throw new Error(`Bot '${bot_name}' not found in registry`);
    }

    try {
      const selectors_content = fs.readFileSync(bot_info.selectors_path, 'utf8');
      return JSON.parse(selectors_content);
    } catch (error) {
      throw new Error(`Error loading selectors for '${bot_name}': ${error}`);
    }
  }

  /** Check if a bot name is registered. */
  bot_exists(bot_name: string): boolean {
    return this.discovered_bots.has(bot_name);
  }

  /** Get all registered bot names as a string array. */
  get_bot_names(): string[] {
    return Array.from(this.discovered_bots.keys());
  }
}

// Export singleton instance
export const bot_registry = new BotRegistry();