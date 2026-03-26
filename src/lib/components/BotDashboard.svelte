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

  /** @type {'logs' | 'stats'} */
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

  $: progressTarget = displayExtractLimit || displayTotalJobs || 0;
  $: progressPercent = progressTarget > 0 ? Math.min(100, Math.round((displayJobsProcessed / progressTarget) * 100)) : 0;

  $: statusBadgeClass =
    displayStatus === 'completed' ? 'badge-success'
    : displayStatus === 'failed' ? 'badge-error'
    : displayStatus === 'stopping' ? 'badge-warning'
    : 'badge-info';

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
</script>

<div class="card bg-base-200 shadow-xl border border-base-300 w-full">
  <!-- Top Bar: Bot name, status, step, stop button -->
  <div class="card-body p-4 pb-3">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <div class="avatar placeholder flex-shrink-0">
          <div class="bg-primary text-primary-content rounded-full w-10 h-10">
            <span class="text-lg">🤖</span>
          </div>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="font-bold text-lg uppercase truncate">{displayName}</h3>
            <span class="badge {statusBadgeClass} badge-sm">{displayStatus}</span>
          </div>
          <p class="text-sm text-base-content/60 truncate">{displayCurrentStep}</p>
        </div>
      </div>
      {#if displayStatus === 'running' || displayStatus === 'stopping'}
        <button
          type="button"
          class="btn btn-error btn-sm gap-1 flex-shrink-0"
          on:click={onStop}
          disabled={displayStatus === 'stopping'}
          title="Stop bot"
          aria-label="Stop bot"
        >
          {displayStatus === 'stopping' ? 'STOPPING...' : 'STOP'}
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>

    <!-- Progress Section -->
    <div class="mt-3">
      <div class="flex justify-between items-baseline mb-1">
        <span class="text-sm font-medium text-base-content/70">Extracted</span>
        <span class="font-bold text-2xl tabular-nums">
          {displayJobsProcessed}<span class="text-base-content/40 text-lg">/{progressTarget}</span>
        </span>
      </div>
      <progress
        class="progress progress-primary w-full h-3"
        value={displayJobsProcessed}
        max={progressTarget || 1}
      ></progress>
      <div class="text-right text-xs text-base-content/50 mt-0.5">{progressPercent}%</div>
    </div>
  </div>

  <!-- Tabs -->
  <div class="border-t border-base-300">
    <div role="tablist" class="tabs tabs-bordered px-4">
      <button
        role="tab"
        class="tab"
        class:tab-active={activeTab === 'logs'}
        on:click={() => activeTab = 'logs'}
      >
        Logs
        <span class="badge badge-ghost badge-xs ml-1">{displayLogs.length}</span>
      </button>
      <button
        role="tab"
        class="tab"
        class:tab-active={activeTab === 'stats'}
        on:click={() => activeTab = 'stats'}
      >
        Stats
      </button>
    </div>
  </div>

  <!-- Tab Content -->
  <div class="px-4 pb-4 pt-2">
    {#if activeTab === 'logs'}
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
    {:else if activeTab === 'stats'}
      <div class="grid grid-cols-3 gap-3 mt-1">
        <div class="stat bg-base-300 rounded-lg p-4 text-center">
          <div class="stat-title text-xs">Found</div>
          <div class="stat-value text-2xl text-info">{displayTotalJobs}</div>
        </div>
        <div class="stat bg-base-300 rounded-lg p-4 text-center">
          <div class="stat-title text-xs">Extracted</div>
          <div class="stat-value text-2xl text-success">{displayJobsProcessed}</div>
        </div>
        <div class="stat bg-base-300 rounded-lg p-4 text-center">
          <div class="stat-title text-xs">Skipped</div>
          <div class="stat-value text-2xl text-warning">{displaySkippedJobs}</div>
        </div>
      </div>
      <div class="mt-4 space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-base-content/60">Extract Limit</span>
          <span class="font-semibold">{displayExtractLimit || 'Unlimited'}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-base-content/60">Applied</span>
          <span class="font-semibold">{displayAppliedJobs}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-base-content/60">Current Step</span>
          <span class="font-semibold truncate ml-4">{displayCurrentStep}</span>
        </div>
      </div>
    {/if}
  </div>

  <!-- Activity indicator -->
  {#if displayStatus === 'running'}
    <div class="flex items-center justify-center gap-2 pb-4 text-sm">
      <span class="loading loading-spinner loading-sm text-primary"></span>
      <span class="text-base-content/60">Bot is running...</span>
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
