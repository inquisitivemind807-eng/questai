<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { tokenStore } from '$lib/stores/tokenStore.js';

  onMount(async () => {
    // Reload token balance after successful payment
    await tokenStore.load();
    
    // Redirect to app after 3 seconds
    setTimeout(() => {
      goto('/app');
    }, 3000);
  });
</script>

<svelte:head>
  <title>Payment Successful</title>
</svelte:head>

<main class="container mx-auto px-4 py-20">
  <div class="max-w-md mx-auto text-center">
    <div class="mb-8">
      <svg class="w-24 h-24 text-success mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
    </div>
    
    <h1 class="text-4xl font-bold mb-4">Payment Successful!</h1>
    <p class="text-lg text-base-content/70 mb-8">
      Your tokens have been added to your account. You can now use them to apply for jobs.
    </p>

    <div class="card bg-base-100 shadow-xl mb-8">
      <div class="card-body">
        <h2 class="card-title justify-center mb-4">Your Token Balance</h2>
        <div class="text-4xl font-bold text-primary">
          {$tokenStore.balance}
        </div>
        <p class="text-sm text-base-content/70">tokens available</p>
      </div>
    </div>

    <div class="space-y-4">
      <button class="btn btn-primary btn-block" on:click={() => goto('/app')}>
        Go to Dashboard
      </button>
      <button class="btn btn-outline btn-block" on:click={() => goto('/plans')}>
        Buy More Tokens
      </button>
    </div>

    <p class="text-sm text-base-content/70 mt-8">
      Redirecting to dashboard in 3 seconds...
    </p>
  </div>
</main>
