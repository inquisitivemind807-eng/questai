import { WebDriver } from 'selenium-webdriver';

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

export class UniversalOverlay {
  private driver: WebDriver;
  private overlayId: string;
  private botName: string;
  private initialized: boolean = false;

  constructor(driver: WebDriver, botName: string = 'Bot', overlayId: string = 'universal-overlay') {
    this.driver = driver;
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
    await this.driver.executeScript(`
      (function() {
        // Prevent duplicate initialization
        if (window.__overlaySystemInitialized) {
          console.log('[Overlay] System already initialized');
          return;
        }
        window.__overlaySystemInitialized = true;

        const OVERLAY_ID = '${this.overlayId}';
        const BOT_NAME = '${this.botName}';
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
        function saveState(state) {
          try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          } catch (e) {
            console.error('[Overlay] Failed to save state:', e);
          }
        }

        // Create or update overlay
        function createOverlay(state) {
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

          // Base styles - pointer-events: none so overlay does not block page interaction
          // (clicks pass through to search inputs, buttons, etc.); children use 'auto' for our UI
          const baseStyles = {
            position: 'fixed',
            top: position.y + 'px',
            left: position.x + 'px',
            background: '#1a1a1add',
            border: '2px solid #00ffff80',
            borderRadius: collapsed ? '50%' : '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            zIndex: '2147483647', // Maximum z-index
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: '#ffffff',
            transition: 'all 0.3s ease',
            backdropFilter: 'blur(10px)',
            userSelect: 'none',
            pointerEvents: 'none', // Allow clicks to pass through to page beneath
            width: collapsed ? '60px' : '400px',
            height: collapsed ? '60px' : 'auto',
            minHeight: collapsed ? '60px' : '150px'
          };

          Object.assign(overlay.style, baseStyles);

          // Inject font
          if (!document.getElementById('overlay-font')) {
            const fontLink = document.createElement('link');
            fontLink.id = 'overlay-font';
            fontLink.href = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&display=swap';
            fontLink.rel = 'stylesheet';
            document.head.appendChild(fontLink);
          }

          // Create header
          const header = document.createElement('div');
          header.className = 'overlay-header';

          const headerStyles = {
            padding: collapsed ? '0' : '12px 16px',
            borderBottom: collapsed ? 'none' : '1px solid #00ffff40',
            display: 'flex',
            justifyContent: collapsed ? 'center' : 'space-between',
            alignItems: 'center',
            cursor: 'move',
            width: '100%',
            height: collapsed ? '100%' : 'auto',
            pointerEvents: 'auto' // Override parent so header/buttons remain clickable
          };

          Object.assign(header.style, headerStyles);

          // Title
          const title = document.createElement('div');
          title.style.display = collapsed ? 'none' : 'block';
          title.style.fontWeight = 'bold';
          title.style.fontSize = '16px';
          title.style.color = '#00ffff';
          title.textContent = \`🤖 \${BOT_NAME} Bot\`;

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
            transition: 'all 0.2s ease'
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
          content.style.pointerEvents = 'auto'; // Override parent so content buttons remain clickable

          // Populate content based on type
          if (state.type === 'job_progress') {
            const { appliedJobs = 0, totalJobs = 0, currentStep = '', stepIndex = 0 } = state.data;
            const percentage = totalJobs > 0 ? (appliedJobs / totalJobs) * 100 : 0;

            // Inject keyframes animation if not already present
            if (!document.getElementById('overlay-pulse-animation')) {
              const style = document.createElement('style');
              style.id = 'overlay-pulse-animation';
              style.textContent = \`
                @keyframes pulse {
                  0%, 100% { opacity: 0.3; transform: scale(1); }
                  50% { opacity: 1; transform: scale(1.2); }
                }
              \`;
              document.head.appendChild(style);
            }

            content.innerHTML = \`
              <div style="display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="color: #00ffff;">Jobs Applied:</span>
                  <span style="font-weight: bold; font-size: 16px;">\${appliedJobs}/\${totalJobs}</span>
                </div>
                <div style="background: #333; border-radius: 6px; height: 10px; overflow: hidden;">
                  <div style="background: linear-gradient(90deg, #00ffff, #00dd88); height: 100%; width: \${percentage}%; transition: width 0.3s ease;"></div>
                </div>
                <div style="font-size: 12px; opacity: 0.8; color: #00dd88;">
                  Step \${stepIndex}: \${currentStep}
                </div>
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                  <div style="width: 8px; height: 8px; border-radius: 50%; background: #00ffff; animation: pulse 1.5s ease-in-out infinite;"></div>
                  <span style="font-size: 11px; opacity: 0.6;">Working...</span>
                </div>
              </div>
            \`;
          } else if (state.type === 'sign_in') {
            content.innerHTML = \`
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
            \`;

            // Re-attach button listener after DOM creation
            setTimeout(() => {
              const button = document.getElementById('signin-continue-btn');
              if (button) {
                button.onmouseover = () => button.style.background = '#00bb66';
                button.onmouseout = () => button.style.background = '#00dd88';
                button.onclick = () => {
                  window.__overlaySignInComplete = true;
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
          let currentX, currentY, initialX, initialY;
          let xOffset = position.x;
          let yOffset = position.y;

          header.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            e.preventDefault();
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            isDragging = true;
            overlay.style.opacity = '0.8';
          });

          document.addEventListener('mousemove', (e) => {
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
            subtree: true
          });

          // Also use history API hooks
          const originalPushState = history.pushState;
          const originalReplaceState = history.replaceState;

          history.pushState = function(...args) {
            originalPushState.apply(this, args);
            setTimeout(() => {
              const state = loadState();
              if (state) createOverlay(state);
            }, 500);
          };

          history.replaceState = function(...args) {
            originalReplaceState.apply(this, args);
            setTimeout(() => {
              const state = loadState();
              if (state) createOverlay(state);
            }, 500);
          };

          // Listen for popstate (back/forward)
          window.addEventListener('popstate', () => {
            setTimeout(() => {
              const state = loadState();
              if (state) createOverlay(state);
            }, 500);
          });

          console.log('[Overlay] Navigation watcher setup complete');
        }

        // Expose update function globally
        window.__updateOverlay = function(state) {
          saveState(state);
          createOverlay(state);
        };

        // Expose get state function
        window.__getOverlayState = function() {
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
      })();
    `);
  }

  /**
   * Update overlay state (will persist across navigations)
   */
  private async updateState(state: OverlayState): Promise<void> {
    try {
      await this.driver.executeScript(`
        if (typeof window.__updateOverlay === 'function') {
          window.__updateOverlay(${JSON.stringify(state)});
        }
      `);
    } catch (error) {
      console.error('Error updating overlay state:', error);
    }
  }

  /**
   * Show job progress overlay
   */
  async showJobProgress(appliedJobs: number, totalJobs: number, currentStep: string, stepIndex: number): Promise<void> {
    await this.initialize();

    const state: OverlayState = {
      botName: this.botName,
      type: 'job_progress',
      data: {
        appliedJobs,
        totalJobs,
        currentStep,
        stepIndex
      }
    };

    await this.updateState(state);
  }

  /**
   * Update job progress
   */
  async updateJobProgress(appliedJobs: number, totalJobs: number, currentStep: string, stepIndex: number): Promise<void> {
    try {
      await this.initialize();

      const state: OverlayState = {
        botName: this.botName,
        type: 'job_progress',
        data: {
          appliedJobs,
          totalJobs,
          currentStep,
          stepIndex
        }
      };

      await this.updateState(state);
    } catch (error) {
      if (this.isWindowClosedError(error)) {
        console.warn('Overlay: window closed, skip job progress update.');
      } else {
        console.warn('Overlay job progress failed:', error instanceof Error ? error.message : error);
      }
    }
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
        message: 'Please sign in manually and click continue'
      }
    };

    await this.updateState(state);

    // Reset completion flag
    await this.driver.executeScript(`
      window.__overlaySignInComplete = false;
      sessionStorage.removeItem('overlay_signin_complete');
    `);

    console.log('🔐 Please sign in manually and click "Continue" when done');

    // Wait for continue button
    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(async () => {
        try {
          const completed = await this.driver.executeScript(`
            return window.__overlaySignInComplete === true ||
                   sessionStorage.getItem('overlay_signin_complete') === 'true';
          `);

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
        html: config.html
      },
      position: config.position
    };

    await this.updateState(state);
  }

  /**
   * True when the browser window/tab was closed (overlay updates are no longer possible).
   */
  private isWindowClosedError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.constructor?.name : '';
    return (
      name === 'NoSuchWindowError' ||
      /no such window|target window already closed|web view not found/i.test(msg)
    );
  }

  /**
   * Update overlay content. Fails silently if the window was closed (e.g. user closed a tab).
   */
  async updateOverlay(updates: Partial<OverlayConfig>): Promise<void> {
    try {
      const currentState = await this.driver.executeScript<OverlayState>(`
        return window.__getOverlayState ? window.__getOverlayState() : null;
      `);

      if (currentState) {
        if (updates.title) currentState.data.title = updates.title;
        if (updates.content) currentState.data.message = updates.content;
        if (updates.html) currentState.data.html = updates.html;
        if (updates.position) currentState.position = updates.position;

        await this.updateState(currentState);
      }
    } catch (error) {
      if (this.isWindowClosedError(error)) {
        console.warn('Overlay: window closed, skipping update.');
      } else {
        console.warn('Overlay update failed:', error instanceof Error ? error.message : error);
      }
    }
  }

  /**
   * Hide overlay. Fails silently if the window was closed.
   */
  async hideOverlay(): Promise<void> {
    try {
      await this.driver.executeScript(`
        const overlay = document.getElementById('${this.overlayId}');
        if (overlay) overlay.remove();
        sessionStorage.removeItem('universal_overlay_state');
      `);
    } catch (error) {
      if (this.isWindowClosedError(error)) {
        console.warn('Overlay: window closed, skip hide.');
      } else {
        console.warn('Overlay hide failed:', error instanceof Error ? error.message : error);
      }
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
  async showNotification(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): Promise<void> {
    await this.initialize();

    const icons: Record<string, string> = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };
    const colors: Record<string, string> = {
      info: '#00ffff',
      success: '#00ff88',
      warning: '#ffaa00',
      error: '#ff4444'
    };

    const state: OverlayState = {
      botName: this.botName,
      type: 'custom',
      data: {
        title: `${icons[type]} ${type.charAt(0).toUpperCase() + type.slice(1)}`,
        html: `<div style="color: ${colors[type]}; font-size: 14px;">${message}</div>`
      },
      position: { x: 20, y: 100 }
    };

    await this.updateState(state);
  }
}
