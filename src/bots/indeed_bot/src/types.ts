/**
 * TypeScript types and interfaces for Indeed Auto-Apply Bot
 */

export interface Config {
  search: SearchConfig;
  camoufox: CamoufoxConfig;
}

export interface SearchConfig {
  base_url: string;
  start: number;
  end: number;
}

export interface CamoufoxConfig {
  user_data_dir: string;
  language: string;
}

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export interface JobCard {
  element: any; // Playwright ElementHandle
  applyButton?: any;
  jobLink?: any;
  jobUrl?: string;
}

export interface ApplicationResult {
  success: boolean;
  jobUrl: string;
  error?: string;
}

export interface Logger {
  info: (message: string) => void;
  warning: (message: string) => void;
  error: (message: string) => void;
}

export interface BrowserContext {
  newPage: () => Promise<any>;
  cookies: () => Promise<Cookie[]>;
}

export interface Page {
  goto: (url: string, options?: { timeout?: number }) => Promise<any>;
  waitForLoadState: (state: string) => Promise<void>;
  querySelector: (selector: string) => Promise<any>;
  querySelectorAll: (selector: string) => Promise<any[]>;
  url: string;
  close: () => Promise<void>;
  screenshot: (options: { path: string }) => Promise<void>;
}

export interface ElementHandle {
  click: () => Promise<void>;
  getAttribute: (name: string) => Promise<string | null>;
  innerText: () => Promise<string>;
  isVisible: () => Promise<boolean>;
  evaluateHandle: (expression: string) => Promise<any>;
}
