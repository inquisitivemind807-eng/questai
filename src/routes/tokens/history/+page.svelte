<script lang="ts">
  import { onMount } from "svelte";
  import { tokenService } from "$lib/services/tokenService.js";
  import { tokenStore } from "$lib/stores/tokenStore.js";

  let transactions: any[] = [];
  let loading: boolean = true;
  let error: string | null = null;
  let page: number = 1;
  let totalPages: number = 1;
  let typeFilter: string = "all";

  onMount(async () => {
    await tokenStore.load();
    await loadTransactions();
  });

  async function loadTransactions() {
    try {
      loading = true;
      error = null;
      const data = await tokenService.getTransactions({
        page,
        limit: 20,
        type: typeFilter !== "all" ? typeFilter : undefined,
      });
      transactions = data.transactions;
      totalPages = data.pagination.totalPages;
    } catch (err: any) {
      error = err.message || String(err);
      console.error("Failed to load transactions:", err);
    } finally {
      loading = false;
    }
  }

  function formatDate(dateString: string | number | Date) {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getTypeBadgeClass(type: string) {
    const classes: Record<string, string> = {
      purchase: "badge-success",
      usage: "badge-warning",
      refund: "badge-error",
      bonus: "badge-info",
      adjustment: "badge-ghost",
    };
    return classes[type] || "badge-ghost";
  }

  function handleTypeChange(e: Event) {
    typeFilter = (e.target as HTMLSelectElement).value;
    page = 1;
    loadTransactions();
  }

  function goToPage(newPage: number) {
    page = newPage;
    loadTransactions();
  }
</script>

<svelte:head>
  <title>Token Transaction History</title>
</svelte:head>

<main class="container mx-auto px-4 py-8">
  <div class="mb-8">
    <h1 class="text-4xl font-bold mb-4">Token Transaction History</h1>
    <p class="text-lg text-base-content/70">
      View all your token purchases, usage, and adjustments
    </p>
  </div>

  <!-- Token Balance Summary -->
  <div class="card bg-base-100 shadow-xl mb-8">
    <div class="card-body">
      <h2 class="card-title">Current Balance</h2>
      <div class="stats stats-vertical lg:stats-horizontal shadow w-full">
        <div class="stat">
          <div class="stat-title">Available Tokens</div>
          <div class="stat-value text-primary">{$tokenStore.balance}</div>
        </div>
        <div class="stat">
          <div class="stat-title">Total Purchased</div>
          <div class="stat-value text-success">
            {$tokenStore.totalPurchased}
          </div>
        </div>
        <div class="stat">
          <div class="stat-title">Total Used</div>
          <div class="stat-value text-warning">{$tokenStore.totalUsed}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Filter -->
  <div class="mb-6">
    <select
      class="select select-bordered w-full max-w-xs"
      on:change={handleTypeChange}
      value={typeFilter}
    >
      <option value="all">All Transactions</option>
      <option value="purchase">Purchases</option>
      <option value="usage">Usage</option>
      <option value="bonus">Bonuses</option>
      <option value="refund">Refunds</option>
      <option value="adjustment">Adjustments</option>
    </select>
  </div>

  {#if loading}
    <div class="flex justify-center items-center py-20">
      <span class="loading loading-spinner loading-lg"></span>
    </div>
  {:else if error}
    <div class="alert alert-error">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="stroke-current shrink-0 h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>Error loading transactions: {error}</span>
      <button class="btn btn-sm" on:click={loadTransactions}>Retry</button>
    </div>
  {:else if transactions.length === 0}
    <div class="alert alert-info">
      <span>No transactions found.</span>
    </div>
  {:else}
    <div class="overflow-x-auto">
      <table class="table table-zebra w-full">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Amount</th>
            <th>Balance Before</th>
            <th>Balance After</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {#each transactions as tx}
            <tr>
              <td class="text-sm">{formatDate(tx.createdAt)}</td>
              <td>
                <span class="badge {getTypeBadgeClass(tx.type)}">
                  {tx.type}
                </span>
              </td>
              <td>
                <span
                  class="font-semibold {tx.amount > 0
                    ? 'text-success'
                    : 'text-error'}"
                >
                  {tx.amount > 0 ? "+" : ""}{tx.amount}
                </span>
              </td>
              <td class="text-sm">{tx.balanceBefore}</td>
              <td class="text-sm font-semibold">{tx.balanceAfter}</td>
              <td class="text-sm max-w-xs truncate" title={tx.description}>
                {tx.description}
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
