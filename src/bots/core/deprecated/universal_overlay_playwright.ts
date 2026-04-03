import type { Page } from 'playwright';

export interface OverlayConfig {
  title?: string;
  content?: string;
  html?: string;
  position?: { x: number; y: number };
  size?: { width: number | string; height: number | string };
  draggable?: boolean;
  collapsible?: boolean;
  autoUpdate?: boolean;
  style?: {
    backgroundColor?: string;
    borderColor?: string;
    textColor?: string;
  };
}

interface OverlayState {
  botName: string;
  type: 'job_progress' | 'sign_in' | 'notification' | 'step_progress' | 'custom';
  data: {
    appliedJobs?: number;
    totalJobs?: number;
    currentStep?: string;
    stepIndex?: number;
    message?: string;
    title?: string;
    html?: string;
  };
  position?: { x: number; y: number };
  collapsed?: boolean;
}

/**
 * UniversalOverlay for Playwright
 *
 * Provides persistent overlay functionality for Playwright/Camoufox browsers
 * Compatible with the workflow engine and BOT_STANDARDS.md
 */
export class UniversalOverlayPlaywright {
  private page: Page;
  private overlayId: string;
  private botName: string;
  private initialized: boolean = false;

  constructor(page: Page, botName: string = 'Bot', overlayId: string = 'universal-overlay') {
    this.page = page;
    this.botName = botName;
    this.overlayId = overlayId;
  }

  /**
   * Initialize the persistent overlay system
   * This sets up navigation detection and auto-reinjection
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.injectPersistentOverlaySystem();
      this.initialized = true;
      console.log(`✅ Overlay system initialized for ${this.botName}`);
    } catch (error) {
      console.error('Error initializing overlay system:', error);
    }
  }

  /**
   * Inject the persistent overlay system that survives page navigations
   */
  private async injectPersistentOverlaySystem(): Promise<void> {
    await this.page.evaluate(
      ({ overlayId, botName }) => {
        // Prevent duplicate initialization
        if ((window as any).__overlaySystemInitialized) {
          console.log('[Overlay] System already initialized');
          return;
        }
        (window as any).__overlaySystemInitialized = true;

        const OVERLAY_ID = overlayId;
        const BOT_NAME = botName;
        const STORAGE_KEY = 'universal_overlay_state';

        console.log('[Overlay] Initializing persistent overlay system for', BOT_NAME);

        // Load saved state from sessionStorage
        function loadState() {
          try {
            const saved = sessionStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : null;
          } catch (e) {
            return null;
          }
        }

        // Save state to sessionStorage
        function saveState(state: any) {
          try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          } catch (e) {
            console.error('[Overlay] Failed to save state:', e);
          }
        }

        // Create or update overlay
        function createOverlay(state: any) {
          if (!state) return;

          // Remove existing overlay
          const existing = document.getElementById(OVERLAY_ID);
          if (existing) existing.remove();

          const position = state.position || { x: 20, y: 20 };
          const collapsed = state.collapsed || false;

          // Create overlay container
          const overlay = document.createElement('div');
          overlay.id = OVERLAY_ID;
          overlay.className = 'universal-dynamic-overlay';

          // Base styles
          const baseStyles = {
            position: 'fixed' as const,
            top: position.y + 'px',
            left: position.x + 'px',
            background: '#1a1a1add',
            border: '2px solid #00ffff80',
            borderRadius: collapsed ? '50%' : '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            zIndex: '2147483647',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: '#ffffff',
            transition: 'all 0.3s ease',
            backdropFilter: 'blur(10px)',
            userSelect: 'none' as const,
            width: collapsed ? '60px' : '400px',
            height: collapsed ? '60px' : 'auto',
            minHeight: collapsed ? '60px' : '150px',
          };

          Object.assign(overlay.style, baseStyles);

          // Create header
          const header = document.createElement('div');
          header.className = 'overlay-header';

          const headerStyles = {
            padding: collapsed ? '0' : '12px 16px',
            borderBottom: collapsed ? 'none' : '1px solid #00ffff40',
            display: 'flex',
            justifyContent: collapsed ? 'center' as const : 'space-between' as const,
            alignItems: 'center',
            cursor: 'move',
            width: '100%',
            height: collapsed ? '100%' : 'auto',
          };

          Object.assign(header.style, headerStyles);

          // Title
          const title = document.createElement('div');
          title.style.display = collapsed ? 'none' : 'block';
          title.style.fontWeight = 'bold';
          title.style.fontSize = '16px';
          title.style.color = '#00ffff';
          title.textContent = `🤖 ${BOT_NAME} Bot`;

          // Controls
          const controls = document.createElement('div');
          controls.style.display = 'flex';
          controls.style.gap = '8px';

          // Collapse button
          const collapseBtn = document.createElement('button');
          collapseBtn.innerHTML = collapsed ? '+' : '−';
          const collapseBtnStyles = {
            background: 'none',
            border: collapsed ? 'none' : '1px solid #00ffff80',
            color: '#00ffff',
            width: collapsed ? '100%' : '24px',
            height: collapsed ? '100%' : '24px',
            borderRadius: collapsed ? '50%' : '6px',
            cursor: 'pointer',
            fontSize: collapsed ? '24px' : '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
          };
          Object.assign(collapseBtn.style, collapseBtnStyles);

          collapseBtn.onmouseover = () => {
            if (!collapsed) collapseBtn.style.background = '#00ffff30';
            collapseBtn.style.transform = 'scale(1.1)';
          };
          collapseBtn.onmouseout = () => {
            if (!collapsed) collapseBtn.style.background = 'none';
            collapseBtn.style.transform = 'scale(1)';
          };

          collapseBtn.onclick = (e) => {
            e.stopPropagation();
            const currentState = loadState();
            if (currentState) {
              currentState.collapsed = !currentState.collapsed;
              saveState(currentState);
              createOverlay(currentState);
            }
          };

          // Content area
          const content = document.createElement('div');
          content.className = 'overlay-content';
          content.style.padding = '16px';
          content.style.fontSize = '13px';
          content.style.lineHeight = '1.4';
          content.style.maxHeight = '400px';
          content.style.overflowY = 'auto';
          content.style.display = collapsed ? 'none' : 'block';

          // Populate content based on type
          if (state.type === 'job_progress') {
            const { appliedJobs = 0, totalJobs = 0, currentStep = '', stepIndex = 0 } = state.data;
            const percentage = totalJobs > 0 ? (appliedJobs / totalJobs) * 100 : 0;

            content.innerHTML = `
              <div style="display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="color: #00ffff;">Jobs Applied:</span>
                  <span style="font-weight: bold; font-size: 16px;">${appliedJobs}/${totalJobs}</span>
                </div>
                <div style="background: #333; border-radius: 6px; height: 10px; overflow: hidden;">
                  <div style="background: linear-gradient(90deg, #00ffff, #00dd88); height: 100%; width: ${percentage}%; transition: width 0.3s ease;"></div>
                </div>
                <div style="font-size: 12px; opacity: 0.8; color: #00dd88;">
                  Step ${stepIndex}: ${currentStep}
                </div>
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                  <div style="width: 8px; height: 8px; border-radius: 50%; background: #00ffff; animation: pulse 1.5s ease-in-out infinite;"></div>
                  <span style="font-size: 11px; opacity: 0.6;">Working...</span>
                </div>
              </div>
              <style>
                @keyframes pulse {
                  0%, 100% { opacity: 0.3; transform: scale(1); }
                  50% { opacity: 1; transform: scale(1.2); }
                }
              </style>
            `;
          } else if (state.type === 'sign_in') {
            content.innerHTML = `
              <div style="text-align: center;">
                <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #ffdd00;">
                  Please sign in to your account manually in this window.
                </p>
                <button id="signin-continue-btn" style="
                  background: #00dd88;
                  color: #1a1a1a;
                  border: none;
                  border-radius: 8px;
                  padding: 12px 20px;
                  font-size: 14px;
                  font-weight: bold;
                  cursor: pointer;
                  width: 100%;
                  transition: all 0.2s ease;
                ">
                  ✅ I have logged in - Continue
                </button>
              </div>
            `;

            // Re-attach button listener after DOM creation
            setTimeout(() => {
              const button = document.getElementById('signin-continue-btn');
              if (button) {
                button.onmouseover = () => (button.style.background = '#00bb66');
                button.onmouseout = () => (button.style.background = '#00dd88');
                button.onclick = () => {
                  (window as any).__overlaySignInComplete = true;
                  sessionStorage.setItem('overlay_signin_complete', 'true');
                };
              }
            }, 100);
          } else if (state.data.html) {
            content.innerHTML = state.data.html;
          } else if (state.data.message) {
            content.textContent = state.data.message;
          }

          // Assemble overlay
          controls.appendChild(collapseBtn);
          header.appendChild(title);
          header.appendChild(controls);
          overlay.appendChild(header);
          overlay.appendChild(content);

          // Drag functionality
          let isDragging = false;
          let currentX: number, currentY: number, initialX: number, initialY: number;
          let xOffset = position.x;
          let yOffset = position.y;

          header.addEventListener('mousedown', (e: MouseEvent) => {
            if ((e.target as HTMLElement).tagName === 'BUTTON') return;
            e.preventDefault();
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            isDragging = true;
            overlay.style.opacity = '0.8';
          });

          document.addEventListener('mousemove', (e: MouseEvent) => {
            if (!isDragging) return;
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            // Keep within viewport
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const rect = overlay.getBoundingClientRect();

            currentX = Math.max(0, Math.min(currentX, viewportWidth - rect.width));
            currentY = Math.max(0, Math.min(currentY, viewportHeight - rect.height));

            xOffset = currentX;
            yOffset = currentY;

            overlay.style.left = currentX + 'px';
            overlay.style.top = currentY + 'px';

            // Save position
            const currentState = loadState();
            if (currentState) {
              currentState.position = { x: xOffset, y: yOffset };
              saveState(currentState);
            }
          });

          document.addEventListener('mouseup', () => {
            if (isDragging) {
              isDragging = false;
              overlay.style.opacity = '1';
            }
          });

          document.body.appendChild(overlay);
          console.log('[Overlay] Created overlay for', state.type);
        }

        // Watch for page navigation and reinject overlay
        function setupNavigationWatcher() {
          let lastUrl = location.href;

          // Use MutationObserver to detect DOM changes
          const observer = new MutationObserver(() => {
            const currentUrl = location.href;
            if (currentUrl !== lastUrl) {
              console.log('[Overlay] Navigation detected:', lastUrl, '->', currentUrl);
              lastUrl = currentUrl;

              // Reinject overlay after a short delay
              setTimeout(() => {
                const state = loadState();
                if (state) {
                  console.log('[Overlay] Reinjecting after navigation');
                  createOverlay(state);
                }
              }, 500);
            }

            // Also check if overlay disappeared from DOM
            if (!document.getElementById(OVERLAY_ID)) {
              const state = loadState();
              if (state) {
                console.log('[Overlay] Overlay missing from DOM, reinjecting');
                createOverlay(state);
              }
            }
          });

          observer.observe(document.body, {
            childList: true,
            subtree: true,
          });

          console.log('[Overlay] Navigation watcher setup complete');
        }

        // Expose update function globally
        (window as any).__updateOverlay = function (state: any) {
          saveState(state);
          createOverlay(state);
        };

        // Expose get state function
        (window as any).__getOverlayState = function () {
          return loadState();
        };

        // Setup navigation watcher
        setupNavigationWatcher();

        // Load and display initial state if exists
        const initialState = loadState();
        if (initialState) {
          createOverlay(initialState);
        }

        console.log('[Overlay] Persistent overlay system ready');
      },
      { overlayId: this.overlayId, botName: this.botName }
    );
  }

  /**
   * Update overlay state (will persist across navigations)
   */
  private async updateState(state: OverlayState): Promise<void> {
    try {
      await this.page.evaluate((stateStr) => {
        if (typeof (window as any).__updateOverlay === 'function') {
          (window as any).__updateOverlay(JSON.parse(stateStr));
        }
      }, JSON.stringify(state));
    } catch (error) {
      console.error('Error updating overlay state:', error);
    }
  }

  /**
   * Show job progress overlay
   */
  async showJobProgress(
    appliedJobs: number,
    totalJobs: number,
    currentStep: string,
    stepIndex: number
  ): Promise<void> {
    await this.initialize();

    const state: OverlayState = {
      botName: this.botName,
      type: 'job_progress',
      data: {
        appliedJobs,
        totalJobs,
        currentStep,
        stepIndex,
      },
    };

    await this.updateState(state);
  }

  /**
   * Update job progress
   */
  async updateJobProgress(
    appliedJobs: number,
    totalJobs: number,
    currentStep: string,
    stepIndex: number
  ): Promise<void> {
    const state: OverlayState = {
      botName: this.botName,
      type: 'job_progress',
      data: {
        appliedJobs,
        totalJobs,
        currentStep,
        stepIndex,
      },
    };

    await this.updateState(state);
  }

  /**
   * Show sign-in overlay
   */
  async showSignInOverlay(): Promise<void> {
    await this.initialize();

    const state: OverlayState = {
      botName: this.botName,
      type: 'sign_in',
      data: {
        title: 'Please Sign In',
        message: 'Please sign in manually and click continue',
      },
    };

    await this.updateState(state);

    // Reset completion flag
    await this.page.evaluate(() => {
      (window as any).__overlaySignInComplete = false;
      sessionStorage.removeItem('overlay_signin_complete');
    });

    console.log('🔐 Please sign in manually and click "Continue" when done');

    // Wait for continue button
    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(async () => {
        try {
          const completed = await this.page.evaluate(() => {
            return (
              (window as any).__overlaySignInComplete === true ||
              sessionStorage.getItem('overlay_signin_complete') === 'true'
            );
          });

          if (completed) {
            clearInterval(checkInterval);
            console.log('✅ Sign-in completed - continuing...');
            await this.hideOverlay();
            resolve();
          }
        } catch (error) {
          // Continue checking
        }
      }, 500);

      // Timeout after 10 minutes
      setTimeout(() => {
        clearInterval(checkInterval);
        console.log('⏰ Sign-in timeout reached');
        resolve();
      }, 10 * 60 * 1000);
    });
  }

  /**
   * Show custom overlay
   */
  async showOverlay(config: OverlayConfig): Promise<void> {
    await this.initialize();

    const state: OverlayState = {
      botName: this.botName,
      type: 'custom',
      data: {
        title: config.title,
        message: config.content,
        html: config.html,
      },
      position: config.position,
    };

    await this.updateState(state);
  }

  /**
   * Update overlay content
   */
  async updateOverlay(updates: Partial<OverlayConfig>): Promise<void> {
    try {
      const currentState = await this.page.evaluate(() => {
        return (window as any).__getOverlayState
          ? (window as any).__getOverlayState()
          : null;
      });

      if (currentState) {
        if (updates.title) currentState.data.title = updates.title;
        if (updates.content) currentState.data.message = updates.content;
        if (updates.html) currentState.data.html = updates.html;
        if (updates.position) currentState.position = updates.position;

        await this.updateState(currentState);
      }
    } catch (error) {
      console.error('Error updating overlay:', error);
    }
  }

  /**
   * Hide overlay
   */
  async hideOverlay(): Promise<void> {
    try {
      await this.page.evaluate((overlayId) => {
        const overlay = document.getElementById(overlayId);
        if (overlay) overlay.remove();
        sessionStorage.removeItem('universal_overlay_state');
      }, this.overlayId);
    } catch (error) {
      console.error('Error hiding overlay:', error);
    }
  }

  /**
   * Remove overlay (alias for hideOverlay)
   */
  async removeOverlay(): Promise<void> {
    await this.hideOverlay();
  }

  /**
   * Show notification
   */
  async showNotification(
    message: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'info'
  ): Promise<void> {
    await this.initialize();

    const icons: Record<string, string> = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌',
    };
    const colors: Record<string, string> = {
      info: '#00ffff',
      success: '#00ff88',
      warning: '#ffaa00',
      error: '#ff4444',
    };

    const state: OverlayState = {
      botName: this.botName,
      type: 'custom',
      data: {
        title: `${icons[type]} ${type.charAt(0).toUpperCase() + type.slice(1)}`,
        html: `<div style="color: ${colors[type]}; font-size: 14px;">${message}</div>`,
      },
      position: { x: 20, y: 100 },
    };

    await this.updateState(state);
  }
}
