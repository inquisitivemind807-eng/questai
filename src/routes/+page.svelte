<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  import { authService } from '$lib/authService.js';

  $: if (!$authService.loading) {
    // Redirect based on authentication status from authService (client-side)
    if ($authService.isLoggedIn) {
      goto('/app');
    } else {
      goto('/login');
    }
  }
</script>

<main class="hero min-h-screen bg-base-200">
  <div class="hero-content text-center">
    <div class="max-w-md">
      <h1 class="text-5xl font-bold">Redirecting...</h1>
      <p class="py-6">Please wait while we redirect you.</p>
      <span class="loading loading-spinner loading-lg"></span>
    </div>
  </div>
</main>