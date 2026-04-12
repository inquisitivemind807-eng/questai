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
  type: 'job_progress' | 'sign_in' | 'notification' | 'step_progress' | 'custom' | 'manual_review' | 'pause_confirm';
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
  expanded?: boolean;
  activeMode?: 'superbot' | 'review' | 'manual';
}

export class UniversalOverlay {
  private driver: WebDriver;
  private overlayId: string;
  private botName: string;
  private initialized: boolean = false;
  private overlayUnavailable: boolean = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly HEARTBEAT_INTERVAL_MS = 1000;
  private lastState: OverlayState | null = null;

  constructor(driver: WebDriver, botName: string = 'Bot', overlayId: string = 'universal-overlay') {
    this.driver = driver;
    this.botName = botName;
    this.overlayId = overlayId;
  }

  /**
   * Initialize the persistent overlay system.
   * Injects the overlay immediately and starts a Node.js heartbeat that
   * monitors the browser context every 3 seconds.  If a page navigation
   * destroyed the injected JS, the heartbeat reinjects it automatically,
   * so the overlay "self-heals" without the bot needing to ask.
   */
  async initialize(): Promise<void> {
    if (this.initialized || this.overlayUnavailable) return;

    try {
      await this.injectPersistentOverlaySystem();
      this.initialized = true;
      this.startHeartbeat();
      console.log(`[DEV] Overlay system initialized for ${this.botName}`);
    } catch (error) {
      if (this.isWindowClosedError(error)) {
        this.overlayUnavailable = true;
      } else {
        console.error('Error initializing overlay system:', error);
      }
    }
  }

  /**
   * Heartbeat: periodically checks if the browser-side overlay system is
   * still alive.  If a full-page navigation killed it, reinjects it.
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(async () => {
      if (this.overlayUnavailable) {
        this.stopHeartbeat();
        return;
      }

      try {
        const alive = await this.driver.executeScript(
          `return typeof window.__overlaySystemInitialized !== 'undefined' && window.__overlaySystemInitialized === true;`
        ) as boolean;

        if (!alive) {
          // Browser context was destroyed (navigation) — reinject
          this.initialized = false;
          await this.injectPersistentOverlaySystem();
          this.initialized = true;

          // If we had a state, re-push it immediately after reinjection
          if (this.lastState) {
            await this.updateState(this.lastState);
          }
        }
      } catch (error) {
        if (this.isWindowClosedError(error)) {
          this.overlayUnavailable = true;
          this.stopHeartbeat();
        }
        // Transient errors (page mid-load) are silently ignored;
        // the next heartbeat tick will retry.
      }
    }, UniversalOverlay.HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stop the heartbeat loop (called on dispose or when overlay becomes unavailable).
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Inject the persistent overlay system that survives page navigations
   */
  private async injectPersistentOverlaySystem(): Promise<void> {
    await this.driver.executeScript(`
      (function() {
        if (window.__overlaySystemInitialized) {
          console.log('[Overlay] System already initialized');
          return;
        }
        window.__overlaySystemInitialized = true;
        window.__overlayRenderInProgress = false;
        window.__overlayUpdateFlushScheduled = false;
        window.__overlayPendingState = null;
        window.__overlayCurrentState = null;
        window.__overlayLogAutoScroll = true;
        window.__overlayLogScrollTop = 0;
        window.__overlayRefs = null;
        window.__overlayNavWatcherInitialized = false;

        const OVERLAY_ID = '${this.overlayId}';
        const BOT_NAME = '${this.botName}';
        const STORAGE_KEY = 'universal_overlay_state';
        const LOG_LIST_ID = OVERLAY_ID + '-log-list';
        const LOG_NEAR_BOTTOM_PX = 14;

        function loadState() {
          try {
            const saved = sessionStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : null;
          } catch (e) {
            return null;
          }
        }

        function saveState(state) {
          try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          } catch (e) {
            console.error('[Overlay] Failed to save state:', e);
          }
        }

        function ensureAssets() {
          if (!document.getElementById('overlay-font')) {
            const fontLink = document.createElement('link');
            fontLink.id = 'overlay-font';
            fontLink.href = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&display=swap';
            fontLink.rel = 'stylesheet';
            document.head.appendChild(fontLink);
          }
          if (!document.getElementById('overlay-styles')) {
            const style = document.createElement('style');
            style.id = 'overlay-styles';
            style.textContent = '@keyframes pulse { 0%,100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 1; transform: scale(1.2); } } ' +
              '.universal-dynamic-overlay *::-webkit-scrollbar { width: 6px !important; height: 6px !important; } ' +
              '.universal-dynamic-overlay *::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.2) !important; border-radius: 10px !important; } ' +
              '.universal-dynamic-overlay *::-webkit-scrollbar-thumb { background: rgba(0, 255, 255, 0.4) !important; border-radius: 10px !important; } ' +
              '.universal-dynamic-overlay *::-webkit-scrollbar-thumb:hover { background: rgba(0, 255, 255, 0.7) !important; }';
            document.head.appendChild(style);
          }
        }

        function clampPosition(overlay, desiredX, desiredY) {
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          const rect = overlay.getBoundingClientRect();
          const overlayWidth = Math.min(rect.width || 0, viewportWidth - 40);
          const overlayHeight = Math.min(rect.height || 0, viewportHeight - 40);
          return {
            x: Math.max(0, Math.min(desiredX, viewportWidth - overlayWidth)),
            y: Math.max(0, Math.min(desiredY, viewportHeight - overlayHeight))
          };
        }

        function ensureOverlayShell(state) {
          let refs = window.__overlayRefs;
          const hasValidRefs = refs &&
            refs.overlay &&
            refs.header &&
            refs.title &&
            refs.controls &&
            refs.collapseBtn &&
            refs.sizeBtn &&
            refs.content &&
            refs.mainContent &&
            refs.logsContainer &&
            refs.logTitle &&
            refs.logList &&
            document.getElementById(OVERLAY_ID) === refs.overlay;

          if (hasValidRefs) {
            if (!document.body.contains(refs.overlay)) {
              document.body.appendChild(refs.overlay);
            }
            return refs;
          }

          const existing = document.getElementById(OVERLAY_ID);
          if (existing) existing.remove();

          ensureAssets();

          const overlay = document.createElement('div');
          overlay.id = OVERLAY_ID;
          overlay.className = 'universal-dynamic-overlay';
          Object.assign(overlay.style, {
            position: 'fixed',
            top: '20px',
            left: '20px',
            background: '#1a1a1add',
            border: '2px solid #00ffff80',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            zIndex: '2147483647',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: '#ffffff',
            transition: 'all 0.2s ease',
            backdropFilter: 'blur(10px)',
            userSelect: 'none',
            pointerEvents: 'none',
            width: '450px',
            maxWidth: 'calc(100vw - 40px)',
            maxHeight: '500px',
            minHeight: '120px',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            overflow: 'hidden',
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            transform: 'none',
            zoom: '1'
          });

          const header = document.createElement('div');
          header.className = 'overlay-header';
          Object.assign(header.style, {
            padding: '16px 20px',
            borderBottom: '1px solid #00ffff40',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'move',
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            pointerEvents: 'auto',
            boxSizing: 'border-box',
            overflow: 'hidden',
            flexShrink: 0,
            gap: '12px'
          });

          const title = document.createElement('div');
          Object.assign(title.style, {
            display: 'block',
            fontWeight: 'bold',
            fontSize: '18px',
            color: '#00ffff',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flexShrink: 1,
            minWidth: 0,
            maxWidth: '100%',
            letterSpacing: '0.3px'
          });
          title.textContent = '🤖 ' + BOT_NAME + ' Bot';

          const controls = document.createElement('div');
          Object.assign(controls.style, {
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            flexShrink: 0,
            overflow: 'visible'
          });

          const sizeBtn = document.createElement('button');
          Object.assign(sizeBtn.style, {
            background: 'none',
            border: '1px solid #00ffff80',
            color: '#00ffff',
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            padding: '0'
          });
          sizeBtn.onmouseover = () => {
            sizeBtn.style.background = '#00ffff30';
            sizeBtn.style.transform = 'scale(1.1)';
          };
          sizeBtn.onmouseout = () => {
            sizeBtn.style.background = 'none';
            sizeBtn.style.transform = 'scale(1)';
          };
          sizeBtn.onclick = (e) => {
            e.stopPropagation();
            const current = loadState() || window.__overlayCurrentState || state;
            if (!current) return;
            current.expanded = !current.expanded;
            queueOverlayRender(current);
          };

          const collapseBtn = document.createElement('button');
          Object.assign(collapseBtn.style, {
            background: 'none',
            border: '1px solid #00ffff80',
            color: '#00ffff',
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease'
          });
          collapseBtn.onmouseover = () => {
            collapseBtn.style.background = '#00ffff30';
            collapseBtn.style.transform = 'scale(1.1)';
          };
          collapseBtn.onmouseout = () => {
            collapseBtn.style.background = 'none';
            collapseBtn.style.transform = 'scale(1)';
          };
          collapseBtn.onclick = (e) => {
            e.stopPropagation();
            const current = loadState() || window.__overlayCurrentState || state;
            if (!current) return;
            current.collapsed = !current.collapsed;
            queueOverlayRender(current);
          };

          const content = document.createElement('div');
          content.className = 'overlay-content';
          Object.assign(content.style, {
            padding: '20px 24px',
            fontSize: '14px',
            lineHeight: '1.6',
            maxHeight: '60vh',
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'block',
            pointerEvents: 'auto',
            boxSizing: 'border-box',
            width: '100%',
            maxWidth: '100%',
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            flexShrink: 1,
            minWidth: 0
          });

          const mainContent = document.createElement('div');
          Object.assign(mainContent.style, {
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box'
          });

          const logsContainer = document.createElement('div');
          Object.assign(logsContainer.style, {
            marginTop: '14px',
            background: '#0b0f14',
            border: '1px solid #3a4754',
            borderRadius: '8px',
            height: '320px',
            maxHeight: '320px',
            minHeight: '200px',
            overflow: 'hidden',
            flexShrink: '0',
            pointerEvents: 'auto',
            overscrollBehavior: 'contain',
            fontFamily: '"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: '11px',
            lineHeight: '1.45',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            maxWidth: '100%',
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 20px rgba(0,0,0,0.30)'
          });

          const logTitle = document.createElement('div');
          Object.assign(logTitle.style, {
            color: '#e7edf2',
            padding: '9px 12px',
            borderBottom: '1px solid #33414d',
            background: '#111821',
            fontWeight: '600',
            fontSize: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.12em'
          });
          logTitle.textContent = 'Logs';

          const logList = document.createElement('div');
          logList.id = LOG_LIST_ID;
          Object.assign(logList.style, {
            padding: '8px 10px 10px',
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
            flex: '1',
            minHeight: '0',
            pointerEvents: 'auto',
            overscrollBehavior: 'contain',
            webkitOverflowScrolling: 'touch',
            scrollbarWidth: 'thin',
            scrollbarColor: '#708090 #131a22'
          });
          logList.addEventListener('scroll', () => {
            const maxScroll = Math.max(0, logList.scrollHeight - logList.clientHeight);
            const nearBottom = (maxScroll - logList.scrollTop) < LOG_NEAR_BOTTOM_PX;
            window.__overlayLogAutoScroll = nearBottom;
            window.__overlayLogScrollTop = logList.scrollTop;
          });

          logsContainer.appendChild(logTitle);
          logsContainer.appendChild(logList);
          content.appendChild(mainContent);
          content.appendChild(logsContainer);
          controls.appendChild(sizeBtn);
          controls.appendChild(collapseBtn);
          header.appendChild(title);
          header.appendChild(controls);
          overlay.appendChild(header);
          overlay.appendChild(content);

          let isDragging = false;
          let currentX = 20;
          let currentY = 20;
          let initialX = 0;
          let initialY = 0;
          let xOffset = 20;
          let yOffset = 20;
          header.addEventListener('mousedown', (e) => {
            if (e.target && e.target.tagName === 'BUTTON') return;
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
            const clamped = clampPosition(overlay, currentX, currentY);
            xOffset = clamped.x;
            yOffset = clamped.y;
            overlay.style.left = xOffset + 'px';
            overlay.style.top = yOffset + 'px';
            const current = loadState() || window.__overlayCurrentState;
            if (current) {
              current.position = { x: xOffset, y: yOffset };
              saveState(current);
              window.__overlayCurrentState = current;
            }
          });
          document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            overlay.style.opacity = '1';
          });

          document.body.appendChild(overlay);

          refs = { overlay, header, title, controls, collapseBtn, sizeBtn, content, mainContent, logsContainer, logTitle, logList };
          window.__overlayRefs = refs;
          return refs;
        }

        function applyShellStyles(refs, state) {
          const collapsed = Boolean(state.collapsed);
          const expanded = Boolean(state.expanded);
          const position = state.position || { x: 20, y: 20 };

          let shellWidth = '450px';
          let shellMaxHeight = '500px';
          if (expanded) {
            shellWidth = '850px';
            shellMaxHeight = '90vh';
          }
          if (collapsed) {
            shellWidth = '60px';
            shellMaxHeight = '60px';
          }

          refs.overlay.style.width = shellWidth;
          refs.overlay.style.height = collapsed ? '60px' : 'auto';
          refs.overlay.style.maxHeight = shellMaxHeight;
          refs.overlay.style.minHeight = collapsed ? '60px' : '120px';
          refs.overlay.style.borderRadius = collapsed ? '50%' : '16px';
          refs.overlay.style.left = position.x + 'px';
          refs.overlay.style.top = position.y + 'px';

          refs.header.style.padding = collapsed ? '0' : '16px 20px';
          refs.header.style.borderBottom = collapsed ? 'none' : '1px solid #00ffff40';
          refs.header.style.justifyContent = collapsed ? 'center' : 'space-between';
          refs.header.style.height = collapsed ? '100%' : 'auto';
          refs.title.style.display = collapsed ? 'none' : 'block';
          refs.content.style.display = collapsed ? 'none' : 'block';

          if (refs.sizeBtn) {
            refs.sizeBtn.textContent = expanded ? '⤡' : '⤢';
            refs.sizeBtn.style.display = collapsed ? 'none' : 'flex';
          }

          refs.collapseBtn.textContent = collapsed ? '+' : '−';
          refs.collapseBtn.style.width = collapsed ? '100%' : '24px';
          refs.collapseBtn.style.height = collapsed ? '100%' : '24px';
          refs.collapseBtn.style.borderRadius = collapsed ? '50%' : '6px';
          refs.collapseBtn.style.border = collapsed ? 'none' : '1px solid #00ffff80';
          refs.collapseBtn.style.fontSize = collapsed ? '24px' : '16px';
        }

        function renderMainContent(refs, state) {
          const data = state.data || {};
          refs.content.style.overflowY = state.type === 'job_progress' ? 'hidden' : 'auto';

          if (state.type === 'job_progress') {
            const appliedJobs = Number(data.appliedJobs || 0);
            const totalJobs = Number(data.totalJobs || 0);
            const currentStep = String(data.currentStep || '');
            const percentage = totalJobs > 0 ? Math.max(0, Math.min(100, (appliedJobs / totalJobs) * 100)) : 0;
            refs.mainContent.innerHTML =
              '<div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:100%;box-sizing:border-box;">' +
                '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;">' +
                  '<span style="color:#8899aa;font-size:13px;font-weight:500;">Extracted</span>' +
                  '<span style="font-weight:bold;font-size:28px;color:#ffffff;font-variant-numeric:tabular-nums;">' +
                    appliedJobs + '<span style="color:#ffffff40;font-size:18px;">/' + totalJobs + '</span>' +
                  '</span>' +
                '</div>' +
                '<div style="background:#333;border-radius:8px;height:10px;overflow:hidden;width:100%;box-shadow:inset 0 2px 4px rgba(0,0,0,0.3);">' +
                  '<div style="background:linear-gradient(90deg,#00ffff,#00dd88);height:100%;width:' + percentage + '%;transition:width 0.3s ease;box-shadow:0 0 8px rgba(0,255,255,0.4);"></div>' +
                '</div>' +
                '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                  '<span style="font-size:12px;color:#8899aa;">' + percentage + '%</span>' +
                  '<span style="font-size:12px;color:#00dd88;max-width:75%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + currentStep + '</span>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:8px;padding-top:2px;">' +
                  '<div style="width:8px;height:8px;border-radius:50%;background:#00ffff;animation:pulse 1.5s ease-in-out infinite;flex-shrink:0;"></div>' +
                  '<span style="font-size:11px;opacity:0.5;">Working...</span>' +
                '</div>' +
              '</div>';
            return;
          }

          if (state.type === 'sign_in') {
            refs.mainContent.innerHTML =
              '<div style="text-align:center;padding:8px 0;">' +
                '<p style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#ffdd00;font-weight:500;">Please sign in to your account manually in this window.</p>' +
                '<button id="signin-continue-btn" style="background:#00dd88;color:#1a1a1a;border:none;border-radius:10px;padding:14px 24px;font-size:15px;font-weight:bold;cursor:pointer;width:100%;max-width:100%;box-sizing:border-box;transition:all 0.2s ease;white-space:normal;box-shadow:0 4px 12px rgba(0,221,136,0.3);">✅ I have logged in - Continue</button>' +
              '</div>';
            setTimeout(() => {
              const button = document.getElementById('signin-continue-btn');
              if (!button) return;
              button.onmouseover = () => {
                button.style.background = '#00bb66';
                button.style.transform = 'translateY(-2px)';
                button.style.boxShadow = '0 6px 16px rgba(0,221,136,0.4)';
              };
              button.onmouseout = () => {
                button.style.background = '#00dd88';
                button.style.transform = 'translateY(0)';
                button.style.boxShadow = '0 4px 12px rgba(0,221,136,0.3)';
              };
              button.onclick = () => {
                window.__overlaySignInComplete = true;
                sessionStorage.setItem('overlay_signin_complete', 'true');
              };
            }, 50);
            return;
          }

          if (state.type === 'manual_review') {
            refs.mainContent.innerHTML =
              '<div style="text-align:center;padding:8px 0;">' +
                '<p style="margin:0 0 24px 0;font-size:16px;line-height:1.7;color:#00ffff;font-weight:500;">' +
                '<strong style="display:block;margin-bottom:8px;font-size:18px;">Manual Review Required</strong>' +
                'Please review the application before submitting.</p>' +
                '<button id="manual-review-btn" style="background:#00dd88;color:#1a1a1a;border:none;border-radius:10px;padding:14px 24px;font-size:15px;font-weight:bold;cursor:pointer;width:100%;max-width:100%;box-sizing:border-box;transition:all 0.2s ease;white-space:normal;box-shadow:0 4px 12px rgba(0,221,136,0.3);">✅ Looks Good - Submit Application</button>' +
              '</div>';
            setTimeout(() => {
              const button = document.getElementById('manual-review-btn');
              if (!button) return;
              button.onmouseover = () => {
                button.style.background = '#00bb66';
                button.style.transform = 'translateY(-2px)';
                button.style.boxShadow = '0 6px 16px rgba(0,221,136,0.4)';
              };
              button.onmouseout = () => {
                button.style.background = '#00dd88';
                button.style.transform = 'translateY(0)';
                button.style.boxShadow = '0 4px 12px rgba(0,221,136,0.3)';
              };
              button.onclick = () => {
                window.__overlayManualReviewComplete = true;
                sessionStorage.setItem('overlay_manual_review_complete', 'true');
              };
            }, 50);
            return;
          }

          if (state.type === 'pause_confirm') {
            const stepLabel = data.message || 'Next step';
            refs.mainContent.innerHTML =
              '<div style="text-align:center;padding:8px 0;">' +
                '<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:16px;">' +
                  '<div style="width:10px;height:10px;border-radius:50%;background:#ffdd00;animation:pulse 1.5s ease-in-out infinite;flex-shrink:0;"></div>' +
                  '<span style="color:#ffdd00;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;">Paused</span>' +
                '</div>' +
                '<p style="margin:0 0 8px 0;font-size:16px;line-height:1.7;color:#00ffff;font-weight:500;">' +
                '<strong style="display:block;margin-bottom:4px;font-size:17px;">Step Complete</strong>' +
                '<span style="color:#aabbcc;font-size:14px;">' + stepLabel + '</span></p>' +
                '<button id="pause-confirm-btn" style="background:linear-gradient(135deg,#00dd88,#00bbcc);color:#1a1a1a;border:none;border-radius:10px;padding:14px 24px;font-size:16px;font-weight:bold;cursor:pointer;width:100%;max-width:100%;box-sizing:border-box;transition:all 0.2s ease;white-space:normal;box-shadow:0 4px 12px rgba(0,221,136,0.3);margin-top:12px;">Next \u25b6</button>' +
              '</div>';
            setTimeout(() => {
              const button = document.getElementById('pause-confirm-btn');
              if (!button) return;
              button.onmouseover = () => {
                button.style.background = 'linear-gradient(135deg,#00bb66,#009999)';
                button.style.transform = 'translateY(-2px)';
                button.style.boxShadow = '0 6px 16px rgba(0,221,136,0.4)';
              };
              button.onmouseout = () => {
                button.style.background = 'linear-gradient(135deg,#00dd88,#00bbcc)';
                button.style.transform = 'translateY(0)';
                button.style.boxShadow = '0 4px 12px rgba(0,221,136,0.3)';
              };
              button.onclick = () => {
                window.__overlayPauseConfirmClicked = true;
                sessionStorage.setItem('overlay_pause_confirm_clicked', 'true');
              };
            }, 50);
            return;
          }

          if (data.html) {
            refs.mainContent.innerHTML = data.html;
            return;
          }
          refs.mainContent.textContent = data.message || '';
        }

        function renderLogs(refs, state) {
          if (state.collapsed) return;
          const logs = Array.isArray(state?.data?.logs) ? state.data.logs : [];
          const logList = refs.logList;
          const maxScroll = Math.max(0, logList.scrollHeight - logList.clientHeight);
          const currentTop = logList.scrollTop;
          const nearBottom = (maxScroll - currentTop) < LOG_NEAR_BOTTOM_PX;
          const shouldAutoScroll = window.__overlayLogAutoScroll !== false && nearBottom;
          if (!nearBottom) {
            window.__overlayLogAutoScroll = false;
            window.__overlayLogScrollTop = currentTop;
          }

          if (!logs.length) {
            logList.innerHTML = '<div style="color:#93a4b3;font-style:italic;padding:4px;">Waiting for events...</div>';
          } else {
            const html = logs.map((msg) => {
              const safe = String(msg)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
              return '<div style="color:#d7e3ec;word-wrap:break-word;overflow-wrap:break-word;width:100%;max-width:100%;padding:2px 4px;border-radius:4px;background:#141d26;border:1px solid #22303d;flex-shrink:0;">' + safe + '</div>';
            }).join('');
            logList.innerHTML = html;
          }

          requestAnimationFrame(() => {
            if (window.__overlayLogAutoScroll === false) {
              const maxAfter = Math.max(0, logList.scrollHeight - logList.clientHeight);
              const preserved = Number(window.__overlayLogScrollTop || 0);
              logList.scrollTop = Math.min(preserved, maxAfter);
            } else {
              logList.scrollTop = logList.scrollHeight;
              window.__overlayLogAutoScroll = true;
            }
            window.__overlayLogScrollTop = logList.scrollTop;
          });
        }

        function renderOverlayState(state) {
          if (!state) return;
          const refs = ensureOverlayShell(state);
          applyShellStyles(refs, state);
          renderMainContent(refs, state);
          renderLogs(refs, state);
        }

        function flushOverlayQueue() {
          if (window.__overlayRenderInProgress) {
            window.__overlayUpdateFlushScheduled = false;
            scheduleFlush();
            return;
          }
          const nextState = window.__overlayPendingState;
          if (!nextState) {
            window.__overlayUpdateFlushScheduled = false;
            return;
          }
          window.__overlayPendingState = null;
          window.__overlayRenderInProgress = true;
          try {
            renderOverlayState(nextState);
            window.__overlayCurrentState = nextState;
          } finally {
            window.__overlayRenderInProgress = false;
            window.__overlayUpdateFlushScheduled = false;
          }
          if (window.__overlayPendingState) {
            scheduleFlush();
          }
        }

        function scheduleFlush() {
          if (window.__overlayUpdateFlushScheduled) return;
          window.__overlayUpdateFlushScheduled = true;
          requestAnimationFrame(flushOverlayQueue);
        }

        function queueOverlayRender(state) {
          if (!state) return;
          saveState(state);
          window.__overlayPendingState = state;
          scheduleFlush();
        }

        function ensureOverlayPresent() {
          if (document.getElementById(OVERLAY_ID)) return;
          const state = loadState() || window.__overlayCurrentState;
          if (state) queueOverlayRender(state);
        }

        function setupNavigationWatcher() {
          if (window.__overlayNavWatcherInitialized) return;
          window.__overlayNavWatcherInitialized = true;

          // Fast reinjection helper — used by every navigation listener
          function reinjectOverlay() {
            const state = loadState() || window.__overlayCurrentState;
            if (state) queueOverlayRender(state);
          }

          let lastUrl = location.href;
          const observer = new MutationObserver(() => {
            const currentUrl = location.href;
            if (currentUrl !== lastUrl) {
              lastUrl = currentUrl;
              setTimeout(reinjectOverlay, 50);
            }
            ensureOverlayPresent();
          });

          if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
          } else {
            window.addEventListener('DOMContentLoaded', () => {
              if (document.body) observer.observe(document.body, { childList: true, subtree: true });
            });
          }

          // Re-inject on every page lifecycle event so the overlay
          // reappears as fast as possible after navigations.
          window.addEventListener('DOMContentLoaded', () => {
            ensureOverlayPresent();
            reinjectOverlay();
          });
          window.addEventListener('load', () => {
            ensureOverlayPresent();
          });

          const originalPushState = history.pushState;
          const originalReplaceState = history.replaceState;
          history.pushState = function(...args) {
            originalPushState.apply(this, args);
            setTimeout(reinjectOverlay, 50);
          };
          history.replaceState = function(...args) {
            originalReplaceState.apply(this, args);
            setTimeout(reinjectOverlay, 50);
          };
          window.addEventListener('popstate', () => {
            setTimeout(reinjectOverlay, 50);
          });
        }

        window.__queueOverlayRender = queueOverlayRender;
        window.__updateOverlay = function(state) {
          queueOverlayRender(state);
        };
        window.__getOverlayState = function() {
          return loadState();
        };

        setupNavigationWatcher();
        const initialState = loadState();
        if (initialState) queueOverlayRender(initialState);
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
    if (this.overlayUnavailable) return;

    const currentMode = await this.safeExecute(
      () => this.getActiveMode(),
      'getActiveMode'
    );
    state.activeMode = state.activeMode || currentMode || 'superbot';
    this.lastState = state;

    await this.safeExecute(async () => {
      // Fast check: is the browser-side system actually there?
      // Full navigations can wipe it even if Node thinks it's initialized.
      const isAlive = await this.driver.executeScript(`
        return typeof window.__updateOverlay === 'function';
      `).catch(() => false);

      if (!isAlive) {
        this.initialized = false;
      }

      // Re-inject overlay system if it was lost
      if (!this.initialized) {
        await this.injectPersistentOverlaySystem();
        this.initialized = true;
      }

      await this.driver.executeScript(`
        if (typeof window.__updateOverlay === 'function') {
          window.__updateOverlay(${JSON.stringify(state)});
        }
      `);
    }, 'updateState');
  }

  /**
   * Show job progress overlay
   */
  async showJobProgress(appliedJobs: number, totalJobs: number, currentStep: string, stepIndex: number): Promise<void> {
    if (this.overlayUnavailable) return;

    await this.safeExecute(async () => {

      let existingLogs: string[] = [];
      const stateStr = await this.driver.executeScript(`
        return window.__getOverlayState ? JSON.stringify(window.__getOverlayState()) : null;
      `) as string | null;
      if (stateStr) {
        const currentState = JSON.parse(stateStr);
        existingLogs = currentState?.data?.logs || [];
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
    }, 'showJobProgress');
  }

  /**
   * Add a real-time event log to the overlay UI.
   * Fire-and-forget safe — never throws, never blocks the bot on transient failures.
   */
  async addLogEvent(message: string): Promise<void> {
    if (this.overlayUnavailable) return;

    await this.safeExecute(async () => {

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

      if (state.data.logs.length > 80) {
        state.data.logs = state.data.logs.slice(-80);
      }

      await this.updateState(state);
    }, 'addLogEvent');
  }

  /**
   * Update job progress
   */
  async updateJobProgress(appliedJobs: number, totalJobs: number, currentStep: string, stepIndex: number, internalJobs?: number, externalJobs?: number): Promise<void> {
    if (this.overlayUnavailable) return;

    await this.safeExecute(async () => {

      let existingLogs: string[] = [];
      let existingInternal = 0;
      let existingExternal = 0;
      const stateStr = await this.driver.executeScript(`
        return window.__getOverlayState ? JSON.stringify(window.__getOverlayState()) : null;
      `) as string | null;
      if (stateStr) {
        const currentState = JSON.parse(stateStr);
        existingLogs = currentState?.data?.logs || [];
        existingInternal = currentState?.data?.internalJobs || 0;
        existingExternal = currentState?.data?.externalJobs || 0;
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
    }, 'updateJobProgress');
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

    // Wait for continue button — no timeout, waits indefinitely
    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(async () => {
        try {
          const completed = await this.driver.executeScript(`
            return (window.__overlaySignInComplete === true) ||
                   (sessionStorage.getItem('overlay_signin_complete') === 'true');
          `);

          if (!completed) {
            // Self-heal: if the overlay was destroyed by navigation, re-push the sign-in state
            const alive = await this.driver.executeScript(`
              return typeof window.__updateOverlay === 'function';
            `).catch(() => false);
            
            if (!alive) {
              await this.updateState(state);
            }
          }

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

    // Wait for continue button — no timeout, waits indefinitely
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
    });
  }

  /**
   * Show pause-confirm overlay (step-through mode).
   * Renders a "Next ▶" button and waits for user click.
   */
  async showPauseConfirm(stepLabel: string): Promise<void> {
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
      type: 'pause_confirm',
      data: {
        title: 'Paused — Waiting for confirmation',
        message: stepLabel,
        logs: existingLogs
      }
    };

    await this.updateState(state);

    // Reset the click flag
    await this.driver.executeScript(`
      window.__overlayPauseConfirmClicked = false;
      sessionStorage.removeItem('overlay_pause_confirm_clicked');
    `);
  }

  /**
   * Show custom overlay
   */
  async showOverlay(config: OverlayConfig): Promise<void> {
    if (this.overlayUnavailable) return;

    await this.safeExecute(async () => {

      let existingLogs: string[] = [];
      const stateStr = await this.driver.executeScript(`
        return window.__getOverlayState ? JSON.stringify(window.__getOverlayState()) : null;
      `) as string | null;
      if (stateStr) {
        const currentState = JSON.parse(stateStr);
        existingLogs = currentState?.data?.logs || [];
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
    }, 'showOverlay');
  }

  /**
   * True when the browser window/tab was closed permanently (overlay updates are no longer possible).
   */
  private isWindowClosedError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.constructor?.name : '';
    return (
      name === 'NoSuchWindowError' ||
      /no such window|target window already closed|web view not found|invalid session id|session deleted/i.test(msg)
    );
  }

  /**
   * True when the error is a transient connection issue (page navigating, driver busy).
   * These are retryable — the overlay system may recover after the page settles.
   */
  private isTransientError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up|disconnected|connection.*closed|chrome not reachable|cannot determine loading status/i.test(msg);
  }

  private consecutiveFailures = 0;
  private static readonly MAX_CONSECUTIVE_FAILURES = 8;

  /**
   * Execute a driver script with transient-error resilience.
   * On ECONNREFUSED-style failures, waits briefly and retries once.
   * After too many consecutive failures, marks overlay unavailable.
   */
  private async safeExecute<T>(fn: () => Promise<T>, label: string): Promise<T | null> {
    if (this.overlayUnavailable) return null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await fn();
        this.consecutiveFailures = 0;
        return result;
      } catch (error) {
        if (this.isWindowClosedError(error)) {
          this.overlayUnavailable = true;
          return null;
        }
        if (this.isTransientError(error)) {
          this.consecutiveFailures++;
          if (this.consecutiveFailures >= UniversalOverlay.MAX_CONSECUTIVE_FAILURES) {
            console.warn(`Overlay: ${this.consecutiveFailures} consecutive failures, marking unavailable.`);
            this.overlayUnavailable = true;
            return null;
          }
          if (attempt === 0) {
            await new Promise(r => setTimeout(r, 800));
            this.initialized = false;
            continue;
          }
        }
        if (attempt === 1 || !this.isTransientError(error)) {
          // Only log non-transient errors or final retry failure
          if (!this.isTransientError(error)) {
            console.warn(`Overlay ${label}:`, error instanceof Error ? error.message : error);
          }
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Update overlay content. Fails silently on any connection issue.
   */
  async updateOverlay(updates: Partial<OverlayConfig>): Promise<void> {
    if (this.overlayUnavailable) return;

    await this.safeExecute(async () => {
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
    }, 'updateOverlay');
  }

  /**
   * Hide overlay. Fails silently on any connection issue.
   */
  async hideOverlay(): Promise<void> {
    if (this.overlayUnavailable) return;

    await this.safeExecute(async () => {
      await this.driver.executeScript(`
        const overlay = document.getElementById('${this.overlayId}');
        if (overlay) overlay.remove();
        sessionStorage.removeItem('universal_overlay_state');
      `);
    }, 'hideOverlay');
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
    if (this.overlayUnavailable) return;

    await this.safeExecute(async () => {

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
    }, 'showNotification');
  }
}
