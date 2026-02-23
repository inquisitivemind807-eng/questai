/**
 * Configuration loader for Indeed Auto-Apply Bot
 */

import { Config } from './types';
import * as fs from 'fs';
import * as yaml from 'yaml';

export class ConfigLoader {
  private config: Config;

  constructor(configPath: string = 'config.yaml') {
    this.config = this.loadConfig(configPath);
  }

  private loadConfig(configPath: string): Config {
    try {
      const configFile = fs.readFileSync(configPath, 'utf8');
      const config = yaml.parse(configFile) as Config;
      
      // Validate required fields
      if (!config.search?.base_url) {
        throw new Error('Missing required field: search.base_url');
      }
      if (!config.camoufox?.user_data_dir) {
        throw new Error('Missing required field: camoufox.user_data_dir');
      }
      if (!config.camoufox?.language) {
        throw new Error('Missing required field: camoufox.language');
      }

      return config;
    } catch (error) {
      throw new Error(`Failed to load config from ${configPath}: ${error}`);
    }
  }

  getConfig(): Config {
    return this.config;
  }

  getSearchConfig() {
    return this.config.search;
  }

  getCamoufoxConfig() {
    return this.config.camoufox;
  }
}
