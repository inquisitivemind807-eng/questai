import { writable, derived, get } from 'svelte/store';

export interface BotState {
  botId: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  totalJobs: number;
  extractLimit: number;
  jobsProcessed: number;
  appliedJobs: number;
  skippedJobs: number;
  currentStep: string;
  logs: Array<{ timestamp: number; text: string; type: 'info' | 'step' | 'transition' | 'error' | 'success' }>;
  startedAt: number;
}

interface BotProgressStoreState {
  bots: Record<string, BotState>;
}

function createBotProgressStore() {
  const { subscribe, update, set } = writable<BotProgressStoreState>({ bots: {} });

  function getOrCreateBot(state: BotProgressStoreState, botId: string, name?: string): BotState {
    if (state.bots[botId]) return state.bots[botId];
    return {
      botId,
      name: name || botId,
      status: 'running',
      totalJobs: 0,
      extractLimit: 0,
      jobsProcessed: 0,
      appliedJobs: 0,
      skippedJobs: 0,
      currentStep: 'Initializing...',
      logs: [],
      startedAt: Date.now(),
    };
  }

  function appendLog(bot: BotState, text: string, type: BotState['logs'][0]['type'] = 'info'): void {
    bot.logs.push({ timestamp: Date.now(), text, type });
    if (bot.logs.length > 500) {
      bot.logs = bot.logs.slice(-500);
    }
  }

  function applyEvent(bot: BotState, event: any) {
    if (!event) return;

    switch (event.type) {
      case 'transition': {
        const funcName = event.funcName || '';
        const transition = event.transition || '';
        bot.currentStep = transition || `${funcName}`;
        if (event.data) {
          if (event.data.totalJobs) bot.totalJobs = event.data.totalJobs;
          if (event.data.jobsProcessed !== undefined) bot.jobsProcessed = event.data.jobsProcessed;
          if (event.data.appliedJobs !== undefined) bot.appliedJobs = event.data.appliedJobs;
          if (event.data.skippedJobs !== undefined) bot.skippedJobs = event.data.skippedJobs;
        }
        break;
      }
      case 'info': {
        const msg = event.message || '';
        if (msg.includes('initialized') || msg.includes('Bot initialized')) {
          bot.status = 'running';
          if (event.data?.botName) bot.name = event.data.botName;
          if (event.data?.extractLimit) bot.extractLimit = event.data.extractLimit;
          if (event.data?.botId) bot.botId = event.data.botId;
        }
        if (msg.includes('completed') || msg.includes('Bot completed')) {
          bot.status = 'completed';
          bot.currentStep = 'Completed';
          if (event.data?.jobsProcessed !== undefined) bot.jobsProcessed = event.data.jobsProcessed;
          if (event.data?.totalJobs) bot.totalJobs = event.data.totalJobs;
        }
        break;
      }
      case 'job_stat': {
        if (event.data) {
          if (event.data.totalJobs) bot.totalJobs = event.data.totalJobs;
          if (event.data.jobsProcessed !== undefined) bot.jobsProcessed = event.data.jobsProcessed;
          if (event.data.appliedJobs !== undefined) bot.appliedJobs = event.data.appliedJobs;
          if (event.data.skippedJobs !== undefined) bot.skippedJobs = event.data.skippedJobs;
        }
        break;
      }
      case 'error': {
        bot.status = 'failed';
        bot.currentStep = `Error: ${event.message || 'Unknown error'}`;
        break;
      }
    }
  }

  return {
    subscribe,

    startBot(botId: string, name: string, extractLimit: number = 0) {
      update(state => {
        const bot = getOrCreateBot(state, botId, name);
        bot.extractLimit = extractLimit;
        bot.status = 'running';
        state.bots[botId] = bot;
        return { ...state };
      });
    },

    stopBot(botId: string) {
      update(state => {
        delete state.bots[botId];
        return { ...state };
      });
    },

    addLogLine(botId: string, line: string) {
      update(state => {
        let bot = state.bots[botId];
        if (!bot) {
          bot = getOrCreateBot(state, botId);
          state.bots[botId] = bot;
        }

        const trimmed = line.trim();
        if (!trimmed) return state;

        if (trimmed.startsWith('[BOT_EVENT]')) {
          try {
            const payload = JSON.parse(trimmed.slice(11).trim());
            applyEvent(bot, payload);
          } catch { /* not valid JSON, treat as plain log */ }
        }

        const displayLine = trimmed.startsWith('[BOT_EVENT]') ? trimmed.slice(11).trim() : trimmed;
        const logType = trimmed.includes('❌') || trimmed.includes('Error') ? 'error' as const
          : trimmed.includes('✅') ? 'success' as const
          : trimmed.includes('→') || trimmed.includes('Step') ? 'transition' as const
          : 'info' as const;
        appendLog(bot, displayLine, logType);

        return { ...state };
      });
    },

    addProgressEvent(botId: string, event: any) {
      update(state => {
        let bot = state.bots[botId];
        if (!bot) {
          const name = event.data?.botName || event.botName || botId;
          bot = getOrCreateBot(state, botId, name);
          state.bots[botId] = bot;
        }
        applyEvent(bot, event);
        return { ...state };
      });
    },

    reset() {
      set({ bots: {} });
    }
  };
}

export const botProgressStore = createBotProgressStore();

export const activeBots = derived(botProgressStore, ($store) =>
  Object.values($store.bots).filter(b => b.status === 'running')
);

export const allBots = derived(botProgressStore, ($store) =>
  Object.values($store.bots)
);

let listenersInitialized = false;

/**
 * Start global Tauri event listeners. Safe to call multiple times — only initializes once.
 * Uses dynamic import to avoid crashing module evaluation in non-Tauri contexts.
 */
export async function initBotListeners() {
  if (listenersInitialized) return;
  listenersInitialized = true;

  try {
    const { listen } = await import('@tauri-apps/api/event');

    await listen('bot-progress', (event: any) => {
      const payload = event.payload;
      const botId = payload?.data?.botId || payload?.botId || _resolveActiveBotId();
      botProgressStore.addProgressEvent(botId, payload);
    });

    await listen('bot-log', (event: any) => {
      const line = typeof event.payload === 'string' ? event.payload : String(event.payload);
      const botId = _resolveActiveBotId();
      botProgressStore.addLogLine(botId, line);
    });

    console.log('[botProgressStore] Global Tauri event listeners initialized');
  } catch (err) {
    console.warn('[botProgressStore] Failed to initialize Tauri listeners:', err);
    listenersInitialized = false;
  }
}

function _resolveActiveBotId(): string {
  const state = get(botProgressStore);
  const running = Object.values(state.bots).find(b => b.status === 'running');
  return running?.botId || 'default';
}
