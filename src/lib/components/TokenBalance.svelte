<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { tokenStore } from '../stores/tokenStore.js';

  export let showLabel = true;
  export let compact = false;

  onMount(() => {
    tokenStore.load();
  });

  function handleClick() {
    goto('/plans');
  }
</script>

<div 
  class="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
  on:click={handleClick}
  role="button"
  tabindex="0"
  on:keydown={(e) => e.key === 'Enter' && handleClick()}
>
  <div class="flex items-center gap-2">
    <svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
    </svg>
    
    {#if $tokenStore.loading}
      <span class="loading loading-spinner loading-xs"></span>
    {:else}
      <div class="flex flex-col">
        <span class="font-bold text-lg {compact ? 'text-sm' : ''}">
          {$tokenStore.balance}
        </span>
        {#if showLabel && !compact}
          <span class="text-xs text-base-content/70">tokens</span>
        {/if}
      </div>
    {/if}
  </div>

  {#if $tokenStore.balance < 10 && !compact}
    <div class="badge badge-warning badge-sm">Low</div>
  {/if}
</div>
