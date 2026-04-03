<script>
  import { goto } from '$app/navigation';
  import BotDashboard from '$lib/components/BotDashboard.svelte';
  import { botProgressStore, allBots } from '$lib/stores/botProgressStore';

  $: storeBots = $allBots;

  async function stopBot(botId) {
    await botProgressStore.stopBot(botId);
  }
</script>

<div class="container mx-auto p-6 max-w-4xl">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-3xl font-bold">Bot Logs</h1>
    <button class="btn btn-ghost btn-sm gap-1" on:click={() => goto('/run-bots')}>
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      Back to Bots
    </button>
  </div>

  {#if storeBots.length === 0}
    <div class="card bg-base-200 shadow-lg">
      <div class="card-body items-center text-center py-16">
        <div class="text-5xl mb-4 opacity-40">🤖</div>
        <h2 class="text-xl font-semibold text-base-content/60">No bots running</h2>
        <p class="text-base-content/40 mt-1">Start a bot from the run bots page to see activity here.</p>
        <button class="btn btn-primary btn-sm mt-4" on:click={() => goto('/run-bots')}>
          Run a Bot
        </button>
      </div>
    </div>
  {:else}
    <div class="space-y-6">
      {#each storeBots as bot (bot.botId)}
        <BotDashboard
          botId={bot.botId}
          onStop={() => stopBot(bot.botId)}
        />
      {/each}
    </div>
  {/if}
</div>
