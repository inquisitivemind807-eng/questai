import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogCategory = 'api' | 'workflow' | 'error' | 'auth';

interface LoggerContext {
  sessionId?: string;
  botName?: string;
  platform?: string;
  jobId?: string;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: 'finalboss-bot';
  event: string;
  message: string;
  sessionId?: string;
  botName?: string;
  platform?: string;
  jobId?: string;
  data?: Record<string, unknown>;
}

const LOG_ROOT = path.join(process.cwd(), 'logs');
let globalContext: LoggerContext = {};

function getDateStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ensureLogPath(category: LogCategory): string {
  const dir = path.join(LOG_ROOT, getDateStamp());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, `${category}.jsonl`);
}

function maskToken(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

function redactValue(key: string, value: unknown): unknown {
  const k = key.toLowerCase();
  if (k.includes('authorization') || k.includes('token') || k.includes('cookie') || k.includes('password') || k.includes('secret')) {
    if (typeof value === 'string') return maskToken(value);
    return '***';
  }
  return value;
}

function redact(input: unknown): unknown {
  if (Array.isArray(input)) return input.map((item) => redact(item));
  if (!input || typeof input !== 'object') return input;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const redactedPrimitive = redactValue(key, value);
    if (redactedPrimitive !== value) {
      out[key] = redactedPrimitive;
      continue;
    }
    if (value && typeof value === 'object') {
      out[key] = redact(value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function write(category: LogCategory, entry: LogEntry): void {
  try {
    const target = ensureLogPath(category);
    fs.appendFileSync(target, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    // Never crash bot flow because logger failed.
  }
}

function buildEntry(level: LogLevel, event: string, message: string, data?: Record<string, unknown>, context?: LoggerContext): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    service: 'finalboss-bot',
    event,
    message,
    ...globalContext,
    ...(context || {}),
    ...(data ? { data: redact(data) as Record<string, unknown> } : {})
  };
}

export const logger = {
  createSessionId(prefix = 'run'): string {
    return `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
  },

  setContext(context: LoggerContext): void {
    globalContext = { ...globalContext, ...context };
  },

  child(context: LoggerContext) {
    return {
      info: (event: string, message: string, data?: Record<string, unknown>) =>
        logger.info(event, message, data, context),
      warn: (event: string, message: string, data?: Record<string, unknown>) =>
        logger.warn(event, message, data, context),
      error: (event: string, message: string, data?: Record<string, unknown>) =>
        logger.error(event, message, data, context),
      debug: (event: string, message: string, data?: Record<string, unknown>) =>
        logger.debug(event, message, data, context),
      apiRequest: (message: string, data?: Record<string, unknown>) =>
        logger.apiRequest(message, data, context),
      apiResponse: (message: string, data?: Record<string, unknown>) =>
        logger.apiResponse(message, data, context),
      auth: (level: LogLevel, event: string, message: string, data?: Record<string, unknown>) =>
        logger.auth(level, event, message, data, context)
    };
  },

  info(event: string, message: string, data?: Record<string, unknown>, context?: LoggerContext): void {
    write('workflow', buildEntry('info', event, message, data, context));
  },

  warn(event: string, message: string, data?: Record<string, unknown>, context?: LoggerContext): void {
    write('workflow', buildEntry('warn', event, message, data, context));
  },

  error(event: string, message: string, data?: Record<string, unknown>, context?: LoggerContext): void {
    write('error', buildEntry('error', event, message, data, context));
  },

  debug(event: string, message: string, data?: Record<string, unknown>, context?: LoggerContext): void {
    write('workflow', buildEntry('debug', event, message, data, context));
  },

  auth(level: LogLevel, event: string, message: string, data?: Record<string, unknown>, context?: LoggerContext): void {
    write('auth', buildEntry(level, event, message, data, context));
  },

  apiRequest(message: string, data?: Record<string, unknown>, context?: LoggerContext): void {
    write('api', buildEntry('info', 'api.request', message, data, context));
  },

  apiResponse(message: string, data?: Record<string, unknown>, context?: LoggerContext): void {
    write('api', buildEntry('info', 'api.response', message, data, context));
  },

  apiError(message: string, data?: Record<string, unknown>, context?: LoggerContext): void {
    write('api', buildEntry('error', 'api.error', message, data, context));
  }
};
