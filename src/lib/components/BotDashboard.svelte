<script>
  import { onMount, afterUpdate } from 'svelte';
  import { botProgressStore } from '$lib/stores/botProgressStore';

  /** @type {string} */
  export let botId = '';

  /** Direct props fallback (used when store is not populated, e.g. standalone usage) */
  export let botName = '';
  export let status = 'running';
  export let totalJobs = 0;
  export let extractLimit = 0;
  export let jobsProcessed = 0;
  export let appliedJobs = 0;
  export let skippedJobs = 0;
  export let currentStep = 'Initializing...';
  /** @type {Array<{timestamp: number, text: string, type: string}>} */
  export let logs = [];
  export let onStop = () => {};

  /** @type {string} */
  let activeTab = 'logs';
  let logContainer;
  let autoScroll = true;

  // Derive state from store if botId is provided, otherwise use direct props
  $: storeBot = botId ? $botProgressStore.bots[botId] : null;
  $: displayName = (storeBot?.name || botName || 'Bot').replace(/_bot$/, '').replace(/_/g, ' ');
  $: displayStatus = storeBot?.status || status;
  $: displayTotalJobs = storeBot?.totalJobs || totalJobs;
  $: displayExtractLimit = storeBot?.extractLimit || extractLimit;
  $: displayJobsProcessed = storeBot?.jobsProcessed || jobsProcessed;
  $: displayAppliedJobs = storeBot?.appliedJobs || appliedJobs;
  $: displaySkippedJobs = storeBot?.skippedJobs || skippedJobs;
  $: displayCurrentStep = storeBot?.currentStep || currentStep;
  $: displayLogs = storeBot?.logs || logs;

  $: statusBadgeClass =
    displayStatus === 'completed' ? 'badge-success'
    : displayStatus === 'failed' ? 'badge-error'
    : displayStatus === 'stopping' ? 'badge-warning'
    : displayStatus === 'stopped' ? 'badge-ghost border-base-content/20'
    : 'badge-info';

  $: isApplyBot = displayName.toLowerCase().includes('apply') || displayAppliedJobs > 0;
  $: progressValue = isApplyBot ? displayAppliedJobs : displayJobsProcessed;
  $: progressTarget = isApplyBot ? (displayTotalJobs || 1) : (displayExtractLimit || displayTotalJobs || 0);
  $: progressPercent = progressTarget > 0 ? Math.min(100, Math.round((progressValue / progressTarget) * 100)) : 0;

  $: platform = (storeBot?.name || botName || '').toLowerCase();
  $: jobsLink = platform.includes('linkedin') ? '/linkedin-job-tracker' :
                platform.includes('seek') ? '/seek-job-tracker' :
                platform.includes('indeed') ? '/indeed-job-tracker' :
                '/linkedin-job-tracker'; // Default fallback

  $: completionTitle = isApplyBot ? 'Application Batch Complete!' : 'Extraction Complete!';
  $: completionActionText = isApplyBot ? 'View Application Status' : 'View Extracted Jobs';

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function getLogClass(type) {
    switch (type) {
      case 'error': return 'text-error';
      case 'success': return 'text-success';
      case 'step': return 'text-primary font-semibold';
      case 'transition': return 'text-info';
      default: return 'text-base-content/80';
    }
  }

  function handleLogScroll() {
    if (!logContainer) return;
    const maxScroll = logContainer.scrollHeight - logContainer.clientHeight;
    autoScroll = (maxScroll - logContainer.scrollTop) < 20;
  }

  afterUpdate(() => {
    if (logContainer && autoScroll && displayLogs.length > 0) {
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  });

  // Expand/collapse logic for the logs panel
  let isExpanded = (displayStatus === 'running' || displayStatus === 'stopping');
  let prevStatus = displayStatus;
  $: if (displayStatus !== prevStatus) {
    isExpanded = (displayStatus === 'running' || displayStatus === 'stopping');
    prevStatus = displayStatus;
  }

  let copied = false;
  function copyLogs() {
    const text = displayLogs.map(l => `[${formatTime(l.timestamp)}] ${l.text}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      copied = true;
      setTimeout(() => copied = false, 2000);
    });
  }
</script>

<div class="card bg-base-200 shadow-xl border border-base-300 w-full">
  {#if storeBot?.attentionNeeded}
    <div class="bg-warning text-warning-content px-4 py-3 flex items-center justify-between border-b border-warning/20 animate-pulse">
      <div class="flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 fill-current" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
        <span class="font-bold text-sm uppercase">Attention Required: Please login in the browser window</span>
      </div>
    </div>
  {/if}

  <!-- Top Bar: Bot name, status, step, stop button -->
  <div class="card-body p-4 pb-3">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <div class="avatar placeholder flex-shrink-0">
          <div class="bg-primary text-primary-content rounded-full w-10 h-10 flex items-center justify-center">
            <span class="text-lg leading-none">🤖</span>
          </div>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="font-bold text-lg uppercase truncate">{displayName}</h3>
          </div>
          <p class="text-sm text-base-content/60 truncate">{displayCurrentStep}</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-circle"
          on:click={() => isExpanded = !isExpanded}
          title={isExpanded ? 'Collapse logs' : 'Expand logs'}
          aria-label={isExpanded ? 'Collapse logs' : 'Expand logs'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>

        {#if displayStatus === 'running' || displayStatus === 'stopping'}
          <button
            type="button"
            class="btn btn-error btn-sm gap-1 flex-shrink-0"
            on:click={onStop}
            disabled={displayStatus === 'stopping'}
            title="Stop bot"
            aria-label="Stop bot"
          >
            {displayStatus === 'stopping' ? 'STOPPING...' : 'STOP ✕'}
          </button>
        {/if}
      </div>
    </div>

    <!-- Progress Section -->
    <div class="mt-3">
      <div class="flex justify-between items-baseline mb-1">
        <span class="text-sm font-medium text-base-content/70">
          {isApplyBot ? (displayStatus === 'running' || displayStatus === 'stopping' ? 'Applying' : 'Applied') : 'Extracted'}
        </span>
        <span class="font-bold text-2xl tabular-nums">
          {progressValue}<span class="text-base-content/40 text-lg">/{progressTarget}</span>
        </span>
      </div>
      <progress
        class="progress progress-primary w-full h-3"
        value={progressValue}
        max={progressTarget || 1}
      ></progress>
      <div class="text-right text-xs text-base-content/50 mt-0.5">{progressPercent}%</div>
    </div>
  </div>

  <!-- Tabs & Content -->
  {#if isExpanded}
    <div class="border-t border-base-300">
      <div role="tablist" class="tabs tabs-bordered px-4 flex items-center justify-between">
        <div class="flex">
          <button
            role="tab"
            class="tab tab-active"
          >
            Logs
          </button>
        </div>
        {#if displayLogs.length > 0}
          <button
            type="button"
            class="btn btn-ghost btn-xs gap-1 text-base-content/40 hover:text-primary transition-colors"
            on:click={copyLogs}
            title="Copy logs to clipboard"
          >
            {#if copied}
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
              <span class="text-[10px] font-medium uppercase tracking-wider">Copied</span>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span class="text-[10px] font-medium uppercase tracking-wider">Copy</span>
            {/if}
          </button>
        {/if}
      </div>
    </div>

    <!-- Tab Content -->
    <div class="px-4 pb-4 pt-2">
      <div
        bind:this={logContainer}
        on:scroll={handleLogScroll}
        class="log-area bg-base-300 rounded-lg font-mono text-xs leading-relaxed overflow-y-auto overflow-x-hidden"
        style="height: 400px; max-height: 60vh;"
      >
        {#if displayLogs.length === 0}
          <div class="p-4 text-base-content/40 italic">Waiting for events...</div>
        {:else}
          {#each displayLogs as log}
            <div class="px-3 py-0.5 flex gap-2 hover:bg-base-100/30">
              <span class="text-base-content/40 flex-shrink-0 select-none">{formatTime(log.timestamp)}</span>
              <span class="{getLogClass(log.type)} break-all">{log.text}</span>
            </div>
          {/each}
        {/if}
      </div>
      {#if !autoScroll && displayLogs.length > 0}
        <button
          class="btn btn-xs btn-ghost mt-1 w-full"
          on:click={() => { autoScroll = true; if (logContainer) logContainer.scrollTop = logContainer.scrollHeight; }}
        >
          ↓ Scroll to bottom
        </button>
      {/if}
    </div>
  {/if}

  <!-- Activity indicator / Completion CTA -->
  {#if displayStatus === 'running' || displayStatus === 'stopping'}
    <div class="flex items-center justify-center gap-2 pb-4 text-sm">
      <span class="loading loading-spinner loading-sm text-primary"></span>
      <span class="text-base-content/60">{displayStatus === 'stopping' ? 'Bot is stopping...' : 'Bot is running...'}</span>
    </div>
  {:else if displayStatus === 'completed'}
    <div class="flex flex-col items-center justify-center gap-3 pb-6 px-4">
      <div class="text-success flex items-center gap-2 font-bold">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {completionTitle}
      </div>
      <a href={jobsLink} class="btn btn-primary btn-wide shadow-lg shadow-primary/20">
        {completionActionText}
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </a>
    </div>
  {/if}
</div>

<style>
  .log-area {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  }
  .log-area::-webkit-scrollbar {
    width: 6px;
  }
  .log-area::-webkit-scrollbar-track {
    background: transparent;
  }
  .log-area::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
  }
  .log-area::-webkit-scrollbar-thumb:hover {
    background-color: rgba(255, 255, 255, 0.4);
  }
</style>
