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
  type: 'job_progress' | 'sign_in' | 'notification' | 'step_progress' | 'custom' | 'manual_review';
  data: {
    appliedJobs?: number;
    totalJobs?: number;
    internalJobs?: number;
    externalJobs?: number;
    currentStep?: string;
    stepIndex?: number;
    message?: string;
    title?: string;
    html?: string;
    logs?: string[];
  };
  position?: { x: number; y: number };
  collapsed?: boolean;
  activeMode?: 'superbot' | 'review' | 'manual';
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
            width: collapsed ? '60px' : '600px',
            maxWidth: 'calc(100vw - 40px)', // Prevent overflow beyond viewport
            height: collapsed ? '60px' : 'auto',
            maxHeight: collapsed ? '60px' : '90vh',
            minHeight: collapsed ? '60px' : '120px',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            overflow: 'hidden', // Prevent content from overflowing container
            wordWrap: 'break-word', // Break long words
            overflowWrap: 'break-word' // Break long words
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
            padding: collapsed ? '0' : '16px 20px',
            borderBottom: collapsed ? 'none' : '1px solid #00ffff40',
            display: 'flex',
            justifyContent: collapsed ? 'center' : 'space-between',
            alignItems: 'center',
            cursor: 'move',
            width: '100%',
            maxWidth: '100%', // Prevent overflow
            height: collapsed ? '100%' : 'auto',
            minWidth: 0, // Allow flex items to shrink
            pointerEvents: 'auto', // Override parent so header/buttons remain clickable
            boxSizing: 'border-box',
            overflow: 'hidden', // Prevent header content from overflowing
            flexShrink: 0, // Prevent header from shrinking
            gap: '12px' // Add gap between title and controls
          };

          Object.assign(header.style, headerStyles);

          // Title
          const title = document.createElement('div');
          title.style.display = collapsed ? 'none' : 'block';
          title.style.fontWeight = 'bold';
          title.style.fontSize = '18px';
          title.style.color = '#00ffff';
          title.style.overflow = 'hidden';
          title.style.textOverflow = 'ellipsis';
          title.style.whiteSpace = 'nowrap';
          title.style.flexShrink = 1;
          title.style.minWidth = 0;
          title.style.maxWidth = '100%';
          title.style.letterSpacing = '0.3px';
          title.textContent = \`🤖 \${BOT_NAME} Bot\`;

          // Controls
          const controls = document.createElement('div');
          controls.style.display = 'flex';
          controls.style.gap = '10px';
          controls.style.alignItems = 'center';
          controls.style.flexShrink = 0; // Prevent controls from shrinking
          controls.style.overflow = 'visible'; // Allow buttons to be visible

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

          controls.appendChild(collapseBtn);
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
          content.style.padding = '20px 24px';
          content.style.fontSize = '14px';
          content.style.lineHeight = '1.6';
          content.style.maxHeight = '60vh';
          content.style.overflowY = 'auto';
          content.style.overflowX = 'hidden'; // Prevent horizontal scroll
          content.style.display = collapsed ? 'none' : 'block';
          content.style.pointerEvents = 'auto'; // Override parent so content buttons remain clickable
          content.style.boxSizing = 'border-box';
          content.style.width = '100%';
          content.style.maxWidth = '100%';
          content.style.wordWrap = 'break-word';
          content.style.overflowWrap = 'break-word';
          content.style.flexShrink = 1;
          content.style.minWidth = 0;

          // Populate content based on type
          if (state.type === 'job_progress') {
            const { appliedJobs = 0, totalJobs = 0, internalJobs = 0, externalJobs = 0, currentStep = '' } = state.data;
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
              <div style="display: flex; flex-direction: column; gap: 16px; width: 100%; max-width: 100%; box-sizing: border-box;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; min-width: 0; padding-bottom: 4px;">
                  <span style="color: #00ffff; flex-shrink: 0; font-size: 15px; font-weight: 500;">Jobs Extracted:</span>
                  <span style="font-weight: bold; font-size: 20px; flex-shrink: 0; color: #ffffff;">\${appliedJobs}/\${totalJobs}</span>
                </div>
                <div style="display: flex; gap: 10px; font-size: 12px; flex-wrap: wrap; width: 100%;">
                  <span style="background:#00bb6630; border:1px solid #00bb6666; border-radius:8px; padding:6px 12px; color:#00dd88; white-space: nowrap; flex-shrink: 0; font-weight: 500;">📋 Internal: \${internalJobs}</span>
                  <span style="background:#ff880030; border:1px solid #ff880066; border-radius:8px; padding:6px 12px; color:#ffaa44; white-space: nowrap; flex-shrink: 0; font-weight: 500;">🌐 External: \${externalJobs}</span>
                </div>
                <div style="background: #333; border-radius: 8px; height: 10px; overflow: hidden; width: 100%; box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);">
                  <div style="background: linear-gradient(90deg, #00ffff, #00dd88); height: 100%; width: \${percentage}%; transition: width 0.3s ease; box-shadow: 0 0 8px rgba(0, 255, 255, 0.4);"></div>
                </div>
                <div style="font-size: 13px; opacity: 0.9; color: #00dd88; word-wrap: break-word; overflow-wrap: break-word; width: 100%; line-height: 1.5; padding: 8px 0;">\${currentStep}</div>
                <div style="display: flex; align-items: center; gap: 10px; width: 100%; padding-top: 4px;">
                  <div style="width: 10px; height: 10px; border-radius: 50%; background: #00ffff; animation: pulse 1.5s ease-in-out infinite; flex-shrink: 0; box-shadow: 0 0 6px rgba(0, 255, 255, 0.6);"></div>
                  <span style="font-size: 12px; opacity: 0.7; color: #ffffff;">Working...</span>
                </div>
              </div>
            \`;
          } else if (state.type === 'sign_in') {
            content.innerHTML = \`
              <div style="text-align: center; padding: 8px 0;">
                <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.7; color: #ffdd00; font-weight: 500;">
                  Please sign in to your account manually in this window.
                </p>
                <button id="signin-continue-btn" style="
                  background: #00dd88;
                  color: #1a1a1a;
                  border: none;
                  border-radius: 10px;
                  padding: 14px 24px;
                  font-size: 15px;
                  font-weight: bold;
                  cursor: pointer;
                  width: 100%;
                  max-width: 100%;
                  box-sizing: border-box;
                  transition: all 0.2s ease;
                  word-wrap: break-word;
                  overflow-wrap: break-word;
                  white-space: normal;
                  box-shadow: 0 4px 12px rgba(0, 221, 136, 0.3);
                ">
                  ✅ I have logged in - Continue
                </button>
              </div>
            \`;

            // Re-attach button listener after DOM creation
            setTimeout(() => {
              const button = document.getElementById('signin-continue-btn');
              if (button) {
                button.onmouseover = () => {
                  button.style.background = '#00bb66';
                  button.style.transform = 'translateY(-2px)';
                  button.style.boxShadow = '0 6px 16px rgba(0, 221, 136, 0.4)';
                };
                button.onmouseout = () => {
                  button.style.background = '#00dd88';
                  button.style.transform = 'translateY(0)';
                  button.style.boxShadow = '0 4px 12px rgba(0, 221, 136, 0.3)';
                };
                button.onclick = () => {
                  window.__overlaySignInComplete = true;
                  sessionStorage.setItem('overlay_signin_complete', 'true');
                };
              }
            }, 100);
          } else if (state.type === 'manual_review') {
            content.innerHTML = \`
              <div style="text-align: center; padding: 8px 0;">
                <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.7; color: #00ffff; font-weight: 500;">
                  <strong style="display: block; margin-bottom: 8px; font-size: 18px;">Manual Review Required</strong>
                  Please review the application before submitting.
                </p>
                <button id="manual-review-btn" style="
                  background: #00dd88;
                  color: #1a1a1a;
                  border: none;
                  border-radius: 10px;
                  padding: 14px 24px;
                  font-size: 15px;
                  font-weight: bold;
                  cursor: pointer;
                  width: 100%;
                  max-width: 100%;
                  box-sizing: border-box;
                  transition: all 0.2s ease;
                  word-wrap: break-word;
                  overflow-wrap: break-word;
                  white-space: normal;
                  box-shadow: 0 4px 12px rgba(0, 221, 136, 0.3);
                ">
                  ✅ Looks Good - Submit Application
                </button>
              </div>
            \`;

            // Re-attach button listener after DOM creation
            setTimeout(() => {
              const button = document.getElementById('manual-review-btn');
              if (button) {
                button.onmouseover = () => {
                  button.style.background = '#00bb66';
                  button.style.transform = 'translateY(-2px)';
                  button.style.boxShadow = '0 6px 16px rgba(0, 221, 136, 0.4)';
                };
                button.onmouseout = () => {
                  button.style.background = '#00dd88';
                  button.style.transform = 'translateY(0)';
                  button.style.boxShadow = '0 4px 12px rgba(0, 221, 136, 0.3)';
                };
                button.onclick = () => {
                  window.__overlayManualReviewComplete = true;
                  sessionStorage.setItem('overlay_manual_review_complete', 'true');
                };
              }
            }, 100);
          } else if (state.data.html) {
            content.innerHTML = state.data.html;
          } else if (state.data.message) {
            content.textContent = state.data.message;
          }

          // Activity Log Section
          if (!collapsed) {
            const logsContainer = document.createElement('div');
            logsContainer.style.marginTop = '20px';
            logsContainer.style.padding = '16px';
            logsContainer.style.background = '#0a0a0a';
            logsContainer.style.border = '1px solid #00ffff40';
            logsContainer.style.borderRadius = '10px';
            logsContainer.style.maxHeight = '180px';
            logsContainer.style.overflowY = 'auto';
            logsContainer.style.overflowX = 'hidden'; // Prevent horizontal scroll
            logsContainer.style.fontFamily = 'monospace';
            logsContainer.style.fontSize = '13px';
            logsContainer.style.boxSizing = 'border-box';
            logsContainer.style.display = 'flex';
            logsContainer.style.flexDirection = 'column';
            logsContainer.style.gap = '6px';
            logsContainer.style.width = '100%';
            logsContainer.style.maxWidth = '100%';
            logsContainer.style.wordWrap = 'break-word';
            logsContainer.style.overflowWrap = 'break-word';

            const logTitle = document.createElement('div');
            logTitle.style.color = '#00ffff';
            logTitle.style.marginBottom = '10px';
            logTitle.style.fontWeight = 'bold';
            logTitle.style.fontSize = '11px';
            logTitle.style.textTransform = 'uppercase';
            logTitle.style.letterSpacing = '1.2px';
            logTitle.innerHTML = '⚡ Activity Log';
            logsContainer.appendChild(logTitle);

            const logs = state.data.logs || [];
            if (logs.length === 0) {
              const emptyLog = document.createElement('div');
              emptyLog.style.color = '#ffffff40';
              emptyLog.style.fontStyle = 'italic';
              emptyLog.textContent = 'Waiting for events...';
              logsContainer.appendChild(emptyLog);
            } else {
              logs.forEach(msg => {
                const logEntry = document.createElement('div');
                logEntry.style.color = '#00dd88';
                logEntry.style.wordWrap = 'break-word';
                logEntry.style.overflowWrap = 'break-word';
                logEntry.style.width = '100%';
                logEntry.style.maxWidth = '100%';
                logEntry.style.overflow = 'hidden';
                logEntry.textContent = msg;
                logsContainer.appendChild(logEntry);
              });
            }

            // Auto-scroll to bottom of logs
            setTimeout(() => {
              logsContainer.scrollTop = logsContainer.scrollHeight;
            }, 50);

            content.appendChild(logsContainer);
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
            const overlayWidth = Math.min(rect.width, viewportWidth - 40); // Account for padding
            const overlayHeight = Math.min(rect.height, viewportHeight - 40);

            currentX = Math.max(0, Math.min(currentX, viewportWidth - overlayWidth));
            currentY = Math.max(0, Math.min(currentY, viewportHeight - overlayHeight));

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
   * Get the current active mode selected by the user
   */
  public async getActiveMode(defaultMode: 'superbot' | 'review' | 'manual' = 'superbot'): Promise<'superbot' | 'review' | 'manual'> {
    try {
      if (!this.initialized) return defaultMode;
      const mode = await this.driver.executeScript(`
        return window.__overlayActiveMode || null;
      `) as string | null;

      if (mode === 'superbot' || mode === 'review' || mode === 'manual') {
        return mode;
      }
      return defaultMode;
    } catch (e) {
      return defaultMode;
    }
  }

  /**
   * Update overlay state (will persist across navigations)
   */
  private async updateState(state: OverlayState): Promise<void> {
    try {
      // Ensure active mode is preserved or initialized
      const currentMode = await this.getActiveMode();
      state.activeMode = state.activeMode || currentMode;

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

    let existingLogs: string[] = [];
    try {
      const stateStr = await this.driver.executeScript(`
        return window.__getOverlayState ? JSON.stringify(window.__getOverlayState()) : null;
      `) as string | null;
      if (stateStr) {
        const currentState = JSON.parse(stateStr);
        existingLogs = currentState?.data?.logs || [];
      }
    } catch (e) {
      // ignore
    }

    const state: OverlayState = {
      botName: this.botName,
      type: 'job_progress',
      data: {
        appliedJobs,
        totalJobs,
        currentStep,
        stepIndex,
        logs: existingLogs
      }
    };

    await this.updateState(state);
  }

  /**
   * Add a real-time event log to the overlay UI
   */
  async addLogEvent(message: string): Promise<void> {
    if (!this.initialized) return;

    try {
      const stateStr = await this.driver.executeScript(`
        return window.__getOverlayState ? JSON.stringify(window.__getOverlayState()) : null;
      `) as string | null;

      if (!stateStr) return;

      const state: OverlayState = JSON.parse(stateStr);
      if (!state.data.logs) {
        state.data.logs = [];
      }

      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
      state.data.logs.push(`[${timeStr}] ${message}`);

      // Keep only the most recent 20 logs to save UI memory
      if (state.data.logs.length > 20) {
        state.data.logs = state.data.logs.slice(-20);
      }

      await this.updateState(state);
    } catch (error) {
      console.error('Error adding overlay log event:', error);
    }
  }

  /**
   * Update job progress
   */
  async updateJobProgress(appliedJobs: number, totalJobs: number, currentStep: string, stepIndex: number, internalJobs?: number, externalJobs?: number): Promise<void> {
    try {
      await this.initialize();

      let existingLogs: string[] = [];
      let existingInternal = 0;
      let existingExternal = 0;
      try {
        const stateStr = await this.driver.executeScript(`
          return window.__getOverlayState ? JSON.stringify(window.__getOverlayState()) : null;
        `) as string | null;
        if (stateStr) {
          const currentState = JSON.parse(stateStr);
          existingLogs = currentState?.data?.logs || [];
          existingInternal = currentState?.data?.internalJobs || 0;
          existingExternal = currentState?.data?.externalJobs || 0;
        }
      } catch (e) {
        // ignore
      }

      const state: OverlayState = {
        botName: this.botName,
        type: 'job_progress',
        data: {
          appliedJobs,
          totalJobs,
          internalJobs: internalJobs !== undefined ? internalJobs : existingInternal,
          externalJobs: externalJobs !== undefined ? externalJobs : existingExternal,
          currentStep,
          stepIndex,
          logs: existingLogs
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

    let existingLogs: string[] = [];
    try {
      const stateStr = await this.driver.executeScript(`
        return window.__getOverlayState ? JSON.stringify(window.__getOverlayState()) : null;
      `) as string | null;
      if (stateStr) {
        const currentState = JSON.parse(stateStr);
        existingLogs = currentState?.data?.logs || [];
      }
    } catch (e) {
      // ignore
    }

    const state: OverlayState = {
      botName: this.botName,
      type: 'sign_in',
      data: {
        title: 'Please Sign In',
        message: 'Please sign in manually and click continue',
        logs: existingLogs
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
   * Show manual review overlay
   */
  async showManualReviewOverlay(): Promise<void> {
    await this.initialize();

    let existingLogs: string[] = [];
    try {
      const stateStr = await this.driver.executeScript(`
        return window.__getOverlayState ? JSON.stringify(window.__getOverlayState()) : null;
      `) as string | null;
      if (stateStr) {
        const currentState = JSON.parse(stateStr);
        existingLogs = currentState?.data?.logs || [];
      }
    } catch (e) {
      // ignore
    }

    const state: OverlayState = {
      botName: this.botName,
      type: 'manual_review',
      data: {
        title: 'Review Application',
        message: 'Review application and click submit',
        logs: existingLogs
      }
    };

    await this.updateState(state);

    // Reset completion flag
    await this.driver.executeScript(`
      window.__overlayManualReviewComplete = false;
      sessionStorage.removeItem('overlay_manual_review_complete');
    `);

    console.log('⏸️ Pausing for manual review to submit application...');

    // Wait for continue button
    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(async () => {
        try {
          const completed = await this.driver.executeScript(`
            return window.__overlayManualReviewComplete === true ||
                   sessionStorage.getItem('overlay_manual_review_complete') === 'true';
          `);

          if (completed) {
            clearInterval(checkInterval);
            console.log('✅ Manual review completed - submitting application...');
            // Need to remove state after completion so it doesn't reappear
            await this.driver.executeScript(`
              window.__overlayManualReviewComplete = false;
              sessionStorage.removeItem('overlay_manual_review_complete');
            `);
            resolve();
          }
        } catch (error) {
          // Continue checking
        }
      }, 500);

      // Auto-timeout after 30 minutes
      setTimeout(() => {
        clearInterval(checkInterval);
        console.log('⏰ Manual review timeout reached (30 minutes) - auto proceeding');
        resolve();
      }, 30 * 60 * 1000);
    });
  }

  /**
   * Show custom overlay
   */
  async showOverlay(config: OverlayConfig): Promise<void> {
    await this.initialize();

    let existingLogs: string[] = [];
    try {
      const stateStr = await this.driver.executeScript(`
        return window.__getOverlayState ? JSON.stringify(window.__getOverlayState()) : null;
      `) as string | null;
      if (stateStr) {
        const currentState = JSON.parse(stateStr);
        existingLogs = currentState?.data?.logs || [];
      }
    } catch (e) {
      // ignore
    }

    const state: OverlayState = {
      botName: this.botName,
      type: 'custom',
      data: {
        title: config.title,
        message: config.content,
        html: config.html,
        logs: existingLogs
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
