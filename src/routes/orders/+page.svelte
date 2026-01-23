<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { orderService } from '$lib/services/orderService.js';

  let orders = [];
  let loading = true;
  let error = null;
  let page = 1;
  let totalPages = 1;
  let statusFilter = 'all';

  onMount(async () => {
    await loadOrders();
  });

  async function loadOrders() {
    try {
      loading = true;
      error = null;
      const data = await orderService.getOrders({
        page,
        limit: 10,
        status: statusFilter !== 'all' ? statusFilter : undefined
      });
      orders = data.orders;
      totalPages = data.pagination.totalPages;
    } catch (err) {
      error = err.message;
      console.error('Failed to load orders:', err);
    } finally {
      loading = false;
    }
  }

  function formatPrice(cents) {
    return (cents / 100).toFixed(2);
  }

  function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
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

  function handleStatusChange(e) {
    statusFilter = e.target.value;
    page = 1;
    loadOrders();
  }

  function goToPage(newPage) {
    page = newPage;
    loadOrders();
  }
</script>

<svelte:head>
  <title>Order History</title>
</svelte:head>

<main class="container mx-auto px-4 py-8">
  <div class="mb-8">
    <h1 class="text-4xl font-bold mb-4">Order History</h1>
    <p class="text-lg text-base-content/70">
      View your token purchase history and order details
    </p>
  </div>

  <!-- Filter -->
  <div class="mb-6">
    <select class="select select-bordered w-full max-w-xs" on:change={handleStatusChange} value={statusFilter}>
      <option value="all">All Orders</option>
      <option value="completed">Completed</option>
      <option value="pending">Pending</option>
      <option value="processing">Processing</option>
      <option value="failed">Failed</option>
      <option value="refunded">Refunded</option>
    </select>
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
      <span>Error loading orders: {error}</span>
      <button class="btn btn-sm" on:click={loadOrders}>Retry</button>
    </div>
  {:else if orders.length === 0}
    <div class="alert alert-info">
      <span>No orders found.</span>
      <a href="/plans" class="btn btn-sm btn-primary">Buy Tokens</a>
    </div>
  {:else}
    <div class="overflow-x-auto">
      <table class="table table-zebra w-full">
        <thead>
          <tr>
            <th>Order Number</th>
            <th>Plan</th>
            <th>Tokens</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each orders as order}
            <tr>
              <td class="font-mono text-sm">{order.orderNumber}</td>
              <td>{order.planName || order.planId}</td>
              <td>
                <span class="font-semibold">{order.tokensPurchased}</span>
                <span class="text-xs text-base-content/70"> tokens</span>
              </td>
              <td>
                <span class="font-semibold">${formatPrice(order.amount)}</span>
                <span class="text-xs text-base-content/70"> {order.currency.toUpperCase()}</span>
              </td>
              <td>
                <span class="badge {getStatusBadgeClass(order.status)}">
                  {order.status}
                </span>
              </td>
              <td class="text-sm">{formatDate(order.createdAt)}</td>
              <td>
                <button 
                  class="btn btn-xs btn-ghost"
                  on:click={() => goto(`/orders/${order.id}`)}
                >
                  View Details
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
      <div class="flex justify-center mt-8">
        <div class="join">
          <button 
            class="join-item btn"
            disabled={page === 1}
            on:click={() => goToPage(page - 1)}
          >
            «
          </button>
          {#each Array(totalPages) as _, i}
            <button 
              class="join-item btn {page === i + 1 ? 'btn-active' : ''}"
              on:click={() => goToPage(i + 1)}
            >
              {i + 1}
            </button>
          {/each}
          <button 
            class="join-item btn"
            disabled={page === totalPages}
            on:click={() => goToPage(page + 1)}
          >
            »
          </button>
        </div>
      </div>
    {/if}
  {/if}
</main>
