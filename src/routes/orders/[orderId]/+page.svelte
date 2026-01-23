<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { orderService } from '$lib/services/orderService.js';

  let order = null;
  let loading = true;
  let error = null;

  $: orderId = $page.params.orderId;

  onMount(async () => {
    if (orderId) {
      await loadOrder();
    }
  });

  async function loadOrder() {
    try {
      loading = true;
      error = null;
      order = await orderService.getOrder(orderId);
    } catch (err) {
      error = err.message;
      console.error('Failed to load order:', err);
    } finally {
      loading = false;
    }
  }

  function formatPrice(cents) {
    return (cents / 100).toFixed(2);
  }

  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getStatusBadgeClass(status) {
    const classes = {
      completed: 'badge-success',
      pending: 'badge-warning',
      processing: 'badge-info',
      failed: 'badge-error',
      refunded: 'badge-error',
      cancelled: 'badge-ghost'
    };
    return classes[status] || 'badge-ghost';
  }
</script>

<svelte:head>
  <title>Order Details</title>
</svelte:head>

<main class="container mx-auto px-4 py-8 max-w-4xl">
  <div class="mb-6">
    <button class="btn btn-ghost btn-sm" on:click={() => goto('/orders')}>
      ← Back to Orders
    </button>
  </div>

  {#if loading}
    <div class="flex justify-center items-center py-20">
      <span class="loading loading-spinner loading-lg"></span>
    </div>
  {:else if error}
    <div class="alert alert-error">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>Error loading order: {error}</span>
      <button class="btn btn-sm" on:click={loadOrder}>Retry</button>
    </div>
  {:else if order}
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <div class="flex justify-between items-start mb-6">
          <div>
            <h1 class="text-3xl font-bold mb-2">Order Details</h1>
            <p class="text-base-content/70 font-mono">{order.orderNumber}</p>
          </div>
          <span class="badge badge-lg {getStatusBadgeClass(order.status)}">
            {order.status}
          </span>
        </div>

        <div class="divider"></div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 class="text-xl font-semibold mb-4">Plan Information</h2>
            <div class="space-y-2">
              <div>
                <span class="text-sm text-base-content/70">Plan:</span>
                <p class="font-semibold">{order.planName || order.planId}</p>
              </div>
              {#if order.planDescription}
                <div>
                  <span class="text-sm text-base-content/70">Description:</span>
                  <p class="text-sm">{order.planDescription}</p>
                </div>
              {/if}
            </div>
          </div>

          <div>
            <h2 class="text-xl font-semibold mb-4">Token Information</h2>
            <div class="space-y-2">
              <div>
                <span class="text-sm text-base-content/70">Total Tokens:</span>
                <p class="font-semibold text-2xl">{order.tokensPurchased}</p>
              </div>
              <div>
                <span class="text-sm text-base-content/70">Base Tokens:</span>
                <p class="font-semibold">{order.baseTokens}</p>
              </div>
              {#if order.bonusTokens > 0}
                <div>
                  <span class="text-sm text-base-content/70">Bonus Tokens:</span>
                  <p class="font-semibold text-success">+{order.bonusTokens}</p>
                </div>
              {/if}
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 class="text-xl font-semibold mb-4">Payment Information</h2>
            <div class="space-y-2">
              <div>
                <span class="text-sm text-base-content/70">Amount:</span>
                <p class="font-semibold text-2xl">${formatPrice(order.totalAmount)}</p>
                <p class="text-xs text-base-content/70">{order.currency.toUpperCase()}</p>
              </div>
              {#if order.taxAmount}
                <div>
                  <span class="text-sm text-base-content/70">Tax:</span>
                  <p class="font-semibold">${formatPrice(order.taxAmount)}</p>
                </div>
              {/if}
              <div>
                <span class="text-sm text-base-content/70">Payment Method:</span>
                <p class="font-semibold capitalize">{order.paymentMethod}</p>
              </div>
              <div>
                <span class="text-sm text-base-content/70">Payment Status:</span>
                <p class="font-semibold capitalize">{order.paymentStatus}</p>
              </div>
            </div>
          </div>

          <div>
            <h2 class="text-xl font-semibold mb-4">Order Timeline</h2>
            <div class="space-y-2">
              <div>
                <span class="text-sm text-base-content/70">Created:</span>
                <p class="font-semibold">{formatDate(order.createdAt)}</p>
              </div>
              {#if order.completedAt}
                <div>
                  <span class="text-sm text-base-content/70">Completed:</span>
                  <p class="font-semibold">{formatDate(order.completedAt)}</p>
                </div>
              {/if}
              {#if order.refundedAt}
                <div>
                  <span class="text-sm text-base-content/70">Refunded:</span>
                  <p class="font-semibold">{formatDate(order.refundedAt)}</p>
                </div>
              {/if}
            </div>
          </div>
        </div>

        {#if order.notes}
          <div class="divider"></div>
          <div>
            <h2 class="text-xl font-semibold mb-2">Notes</h2>
            <p class="text-sm text-base-content/70">{order.notes}</p>
          </div>
        {/if}

        <div class="card-actions justify-end mt-6">
          <button class="btn btn-primary" on:click={() => goto('/plans')}>
            Buy More Tokens
          </button>
        </div>
      </div>
    </div>
  {/if}
</main>
