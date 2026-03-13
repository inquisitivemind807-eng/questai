<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { authService } from '$lib/authService.js';

  let token = '';
  let newPassword = '';
  let confirmPassword = '';
  let error = '';
  let success = '';
  let loading = false;

  onMount(() => {
    token = $page.url.searchParams.get('token');
    if (!token) {
      error = 'Invalid or missing reset token. Please request a new link.';
    }
  });

  async function handleReset(e) {
    e.preventDefault();
    error = '';
    success = '';

    if (!token) {
      error = 'Missing reset token';
      return;
    }

    if (newPassword.length < 8) {
      error = 'Password must be at least 8 characters';
      return;
    }

    if (newPassword !== confirmPassword) {
      error = 'Passwords do not match';
      return;
    }

    loading = true;
    const result = await authService.resetPassword(token, newPassword);
    loading = false;

    if (result.success) {
      success = result.message || 'Password reset successful!';
      // Redirect to login after a delay
      setTimeout(() => {
        goto('/login');
      }, 3000);
    } else {
      error = result.error || 'Failed to reset password';
    }
  }
</script>

<svelte:head>
  <title>Reset Password - Finalboss</title>
</svelte:head>

<main class="min-h-screen bg-base-200 flex items-center justify-center p-4">
  <div class="max-w-md w-full">
    <div class="text-center mb-8">
      <h1 class="text-4xl font-bold text-primary mb-2">Finalboss</h1>
      <p class="text-base-content/70">Secure Password Reset</p>
    </div>

    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title text-2xl font-bold mb-4 justify-center">Create New Password</h2>

        {#if error}
          <div class="alert alert-error mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
          {#if error.includes('link')}
            <button class="btn btn-outline btn-primary w-full mt-2" on:click={() => goto('/login')}>
              Back to Login
            </button>
          {/if}
        {/if}

        {#if success}
          <div class="alert alert-success mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{success} Redirecting to login...</span>
          </div>
        {/if}

        {#if token && !success}
          <form on:submit={handleReset} class="space-y-4">
            <div class="form-control">
              <label class="label" for="newPassword">
                <span class="label-text">New Password</span>
              </label>
              <input
                id="newPassword"
                type="password"
                placeholder="Min. 8 characters"
                class="input input-bordered w-full"
                bind:value={newPassword}
                disabled={loading}
                required
                minlength="8"
              />
            </div>

            <div class="form-control">
              <label class="label" for="confirmPassword">
                <span class="label-text">Confirm New Password</span>
              </label>
              <input
                id="confirmPassword"
                type="password"
                placeholder="Repeat new password"
                class="input input-bordered w-full"
                bind:value={confirmPassword}
                disabled={loading}
                required
                minlength="8"
              />
            </div>

            <button
              type="submit"
              class="btn btn-primary w-full"
              disabled={loading}
            >
              {#if loading}
                <span class="loading loading-spinner loading-sm"></span>
                Resetting...
              {:else}
                Reset Password
              {/if}
            </button>
          </form>
        {/if}
      </div>
    </div>
  </div>
</main>
