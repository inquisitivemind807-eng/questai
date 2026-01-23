<script>
  import { goto } from '$app/navigation';
</script>

<svelte:head>
  <title>Payment Cancelled</title>
</svelte:head>

<main class="container mx-auto px-4 py-20">
  <div class="max-w-md mx-auto text-center">
    <div class="mb-8">
      <svg class="w-24 h-24 text-warning mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
      </svg>
    </div>
    
    <h1 class="text-4xl font-bold mb-4">Payment Cancelled</h1>
    <p class="text-lg text-base-content/70 mb-8">
      Your payment was cancelled. No charges were made to your account.
    </p>

    <div class="space-y-4">
      <button class="btn btn-primary btn-block" on:click={() => goto('/plans')}>
        Back to Plans
      </button>
      <button class="btn btn-outline btn-block" on:click={() => goto('/app')}>
        Go to Dashboard
      </button>
    </div>
  </div>
</main>
