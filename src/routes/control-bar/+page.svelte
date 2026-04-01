<script lang="ts">
  import { onMount } from 'svelte';
  
  let selectedProvider = 'seek';
  let linkedinUsername = '';
  let linkedinPassword = '';
  let botStatus = 'stopped'; // 'stopped', 'running', 'loading'
  let currentTask = 'Idle';
  let isFlipped = false;
  
  const providers = [
    { value: 'seek', label: 'Seek' },
    { value: 'deknil', label: 'LinkedIn' }
  ];

  function handleProviderChange() {
    // Reset credentials when provider changes
    if (selectedProvider !== 'deknil') {
      linkedinUsername = '';
      linkedinPassword = '';
    }
  }

  function toggleBot() {
    if (botStatus === 'stopped') {
      botStatus = 'loading';
      currentTask = 'Starting up...';
      
      // Simulate startup process
      setTimeout(() => {
        botStatus = 'running';
        currentTask = 'Scraping job listings...';
      }, 2000);
    } else if (botStatus === 'running') {
      botStatus = 'loading';
      currentTask = 'Shutting down...';
      
      // Simulate shutdown process
      setTimeout(() => {
        botStatus = 'stopped';
        currentTask = 'Idle';
      }, 1000);
    }
  }


  function getBotStatusClass() {
    switch (botStatus) {
      case 'running': return 'status-running';
      case 'loading': return 'status-loading';
      case 'stopped': 
      default: return 'status-stopped';
    }
  }

  function getButtonText() {
    switch (botStatus) {
      case 'running': return 'STOP';
      case 'loading': return 'Loading...';
      case 'stopped': 
      default: return 'START';
    }
  }

  onMount(() => {
    // Simulate periodic task updates when running
    const interval = setInterval(() => {
      if (botStatus === 'running') {
        const tasks = [
          'Scraping job listings...',
          'Analyzing job descriptions...',
          'Filtering by preferences...',
          'Preparing applications...',
          'Checking application status...'
        ];
        currentTask = tasks[Math.floor(Math.random() * tasks.length)];
      }
    }, 5000);

    return () => clearInterval(interval);
  });
</script>

<!-- Control Bar -->
<div class="navbar bg-base-100 shadow-lg">
  <div class="navbar-start">
    <div class="form-control">
      <label class="label" for="provider-select">
        <span class="label-text font-semibold">Provider</span>
      </label>
      <select id="provider-select" bind:value={selectedProvider} onchange={handleProviderChange} class="select select-bordered w-32">
        {#each providers as provider}
          <option value={provider.value}>{provider.label}</option>
        {/each}
      </select>
    </div>

    {#if selectedProvider === 'deknil'}
      <div class="ml-4 flex gap-2">
        <input
          type="text"
          placeholder="LinkedIn username"
          bind:value={linkedinUsername}
          class="input input-bordered input-sm w-40"
        />
        <input
          type="password"
          placeholder="LinkedIn password"
          bind:value={linkedinPassword}
          class="input input-bordered input-sm w-40"
        />
      </div>
    {/if}
  </div>

  <div class="navbar-center">
    <button
      class="btn btn-lg {botStatus === 'running' ? 'btn-error' : botStatus === 'loading' ? 'btn-warning' : 'btn-success'}"
      onclick={toggleBot}
      disabled={botStatus === 'loading'}
    >
      {#if botStatus === 'loading'}
        <span class="loading loading-spinner"></span>
      {/if}
      {getButtonText()}
    </button>
  </div>

  <div class="navbar-end">

    <div class="ml-4 text-right">
      <div class="flex items-center gap-2">
        <div class="badge {botStatus === 'running' ? 'badge-success' : botStatus === 'loading' ? 'badge-warning' : 'badge-neutral'}">
          {#if botStatus === 'running'}
            Running
          {:else if botStatus === 'loading'}
            Loading
          {:else}
            Stopped
          {/if}
        </div>
      </div>
      <div class="text-sm text-base-content/70">
        <span class="font-semibold">Task:</span> {currentTask}
      </div>
    </div>
  </div>
</div>

<!-- Main Content -->
<div class="container mx-auto p-6">
  <!-- Hero Section -->
  <div class="hero bg-base-200 rounded-box mb-8">
    <div class="hero-content text-center">
      <div class="max-w-md">
        <h1 class="text-5xl font-bold">🤖 Bot Control Center</h1>
        <p class="py-6">Configure and control your job application bot from this central dashboard.</p>
      </div>
    </div>
  </div>

  <!-- Feature Cards -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body items-center text-center">
        <div class="text-4xl mb-2">⚡</div>
        <h2 class="card-title">Real-time Control</h2>
        <p>Start and stop the bot instantly with live status updates</p>
      </div>
    </div>

    <div class="card bg-base-100 shadow-xl">
      <div class="card-body items-center text-center">
        <div class="text-4xl mb-2">🔄</div>
        <h2 class="card-title">Provider Switching</h2>
        <p>Switch between different job platforms seamlessly</p>
      </div>
    </div>

    <div class="card bg-base-100 shadow-xl">
      <div class="card-body items-center text-center">
        <div class="text-4xl mb-2">📊</div>
        <h2 class="card-title">Live Monitoring</h2>
        <p>Track current tasks and bot performance in real-time</p>
      </div>
    </div>

    <div class="card bg-base-100 shadow-xl">
      <div class="card-body items-center text-center">
        <div class="text-4xl mb-2">🔒</div>
        <h2 class="card-title">Secure Credentials</h2>
        <p>Safely store and manage platform login credentials</p>
      </div>
    </div>
  </div>

  <!-- Status Overview -->
  <div class="card bg-base-100 shadow-xl">
    <div class="card-body">
      <h2 class="card-title justify-center mb-6">Current Status Overview</h2>

      <div class="stats stats-vertical lg:stats-horizontal shadow">
        <div class="stat">
          <div class="stat-title">Active Provider</div>
          <div class="stat-value text-lg">{providers.find(p => p.value === selectedProvider)?.label || 'Unknown'}</div>
        </div>

        <div class="stat">
          <div class="stat-title">Bot State</div>
          <div class="stat-value text-lg">
            <div class="badge {botStatus === 'running' ? 'badge-success' : botStatus === 'loading' ? 'badge-warning' : 'badge-neutral'}">
              {botStatus.charAt(0).toUpperCase() + botStatus.slice(1)}
            </div>
          </div>
        </div>

        <div class="stat">
          <div class="stat-title">Current Activity</div>
          <div class="stat-value text-lg">{currentTask}</div>
        </div>

        {#if selectedProvider === 'deknil'}
          <div class="stat">
            <div class="stat-title">LinkedIn Account</div>
            <div class="stat-value text-lg">{linkedinUsername || 'Not configured'}</div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

