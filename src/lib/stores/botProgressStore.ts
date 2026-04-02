import { writable, derived, get } from 'svelte/store';

export interface BotState {
  botId: string;
  name: string;
  status: 'running' | 'stopping' | 'completed' | 'failed' | 'stopped';
  totalJobs: number;
  extractLimit: number;
  jobsProcessed: number;
  appliedJobs: number;
  skippedJobs: number;
  currentStep: string;
  attentionNeeded?: boolean;
  attentionMessage?: string;
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
      attentionNeeded: false,
      attentionMessage: '',
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
          if (event.data?.totalJobs) bot.totalJobs = event.data.totalJobs;
        }
        
        if (msg.toLowerCase().includes('user_needs_to_login') || msg.toLowerCase().includes('please sign in')) {
          bot.attentionNeeded = true;
          bot.attentionMessage = msg;
        } else if (msg.toLowerCase().includes('logged in') || msg.toLowerCase().includes('login_success') || msg.toLowerCase().includes('login_not_needed')) {
          bot.attentionNeeded = false;
          bot.attentionMessage = '';
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

    async stopBot(botId: string) {
      // Set status to "stopping" immediately for UI feedback
      update(state => {
        const bot = state.bots[botId];
        if (bot) bot.status = 'stopping';
        return { ...state };
      });

      // Tell Rust to kill the child process
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const state = get(botProgressStore);
        const bot = state.bots[botId];
        const botName = bot?.name || botId;
        await invoke('stop_bot', { botId: botName });
      } catch (err) {
        console.error('Failed to stop bot:', err);
      }
    },

    addLogLine(botId: string, line: string) {
      update(state => {
        const trimmed = line.trim();
        if (!trimmed) return state;

        let effectiveBotId = botId;
        let payload: any = null;

        if (trimmed.startsWith('[BOT_EVENT]')) {
          try {
            payload = JSON.parse(trimmed.slice(11).trim());
            if (payload?.botId) {
              effectiveBotId = payload.botId;
            }
          } catch { /* not valid JSON, treat as plain log */ }
        }

        let bot = state.bots[effectiveBotId];
        if (!bot) {
          // Unknown bot ID — do not create a phantom panel. Drop the log.
          return state;
        }

        if (payload) {
          applyEvent(bot, payload);
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
        const effectiveBotId = event.botId || event.data?.botId || botId;
        let bot = state.bots[effectiveBotId];
        if (!bot) {
          // Unknown bot ID — do not create a phantom panel.
          return state;
        }
        applyEvent(bot, event);
        return { ...state };
      });
    },

    reset() {
      set({ bots: {} });
    },

    handleBotStopped(botName: string, exitCode: number, botId?: string) {
      update(state => {
        for (const bot of Object.values(state.bots)) {
          // If botId is provided, use it for exact matching. Otherwise fallback to name.
          const isMatch = botId ? (bot.botId === botId) : (bot.name === botName || bot.botId === botName);
          
          if (isMatch) {
            const wasStopping = bot.status === 'stopping';
            
            if (wasStopping) {
              bot.status = 'stopped';
              bot.currentStep = 'Stopped by user';
            } else {
              bot.status = exitCode === 0 ? 'completed' : 'failed';
              bot.currentStep = exitCode === 0 ? 'Completed' : (exitCode === 130 || exitCode === 143 ? 'Stopped by user' : `Failed (Exit code: ${exitCode})`);
            }

            // Append a summary log line
            const summary = `Bot finished. Status: ${bot.status}. Processed: ${bot.jobsProcessed}, Applied: ${bot.appliedJobs}, Skipped: ${bot.skippedJobs}${bot.totalJobs > 0 ? `, Total: ${bot.totalJobs}` : ''}`;
            appendLog(bot, summary, bot.status === 'failed' ? 'error' : 'success');
          }
        }
        return { ...state };
      });
    }
  };
}

export const botProgressStore = createBotProgressStore();

export const activeBots = derived(botProgressStore, ($store) =>
  Object.values($store.bots).filter(b => b.status === 'running' || b.status === 'stopping')
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
      const payload = event.payload;
      // Rust now sends { line, botId } — use authoritative botId
      const line = typeof payload === 'object' ? payload.line : String(payload);
      const botId = (typeof payload === 'object' ? payload.botId : '') || _resolveActiveBotId();

      if (botId) {
        botProgressStore.addLogLine(botId, line);
      }
    });

    await listen('bot-stopped', (event: any) => {
      const payload = event.payload;
      const botName = payload?.botName || '';
      const botId = payload?.botId || '';
      const exitCode = payload?.exitCode ?? -1;
      botProgressStore.handleBotStopped(botName, exitCode, botId);
    });

    console.log('[botProgressStore] Global Tauri event listeners initialized');
  } catch (err) {
    console.warn('[botProgressStore] Failed to initialize Tauri listeners:', err);
    listenersInitialized = false;
  }
}

function _resolveActiveBotId(): string {
  const state = get(botProgressStore);
  const bots = Object.values(state.bots);
  // Prefer running/stopping bots
  const active = bots
    .filter(b => b.status === 'running' || b.status === 'stopping')
    .sort((a, b) => b.startedAt - a.startedAt);
  if (active.length > 0) return active[0].botId;
  // Fall back to most recent bot of any status (catches post-completion logs)
  const any = [...bots].sort((a, b) => b.startedAt - a.startedAt);
  return any[0]?.botId || '';
}
