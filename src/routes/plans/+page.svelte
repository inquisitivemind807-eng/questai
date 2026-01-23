<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { planService } from '$lib/services/planService.js';
  import { tokenStore } from '$lib/stores/tokenStore.js';
  import { authService } from '$lib/authService.js';

  let plans = [];
  let loading = true;
  let error = null;
  let processingPlanId = null;
  let selectedPlanId = null;

  onMount(async () => {
    await loadPlans();
    await tokenStore.load();
  });

  async function loadPlans() {
    try {
      loading = true;
      error = null;
      plans = await planService.getPlans();
      
      // Set Gold plan as default selected
      const goldPlan = plans.find(p => p.planId === 'gold');
      if (goldPlan) {
        selectedPlanId = 'gold';
      } else if (plans.length > 0) {
        // Fallback to first plan if gold not found
        selectedPlanId = plans[0].planId;
      }
    } catch (err) {
      error = err.message;
      console.error('Failed to load plans:', err);
    } finally {
      loading = false;
    }
  }

  function selectPlan(planId) {
    // This ensures only one plan is selected at a time
    selectedPlanId = planId;
  }

  async function handlePurchase(planId) {
    if (processingPlanId) return; // Prevent double clicks
    
    // Set selected plan
    selectedPlanId = planId;
    
    try {
      processingPlanId = planId;
      
      // Check if user is logged in
      if (!$authService.isLoggedIn) {
        throw new Error('Please login first to purchase tokens');
      }
      
      const successUrl = `${window.location.origin}/payment/success`;
      const cancelUrl = `${window.location.origin}/payment/cancel`;
      
      console.log('Creating checkout session for plan:', planId);
      console.log('Success URL:', successUrl);
      console.log('Cancel URL:', cancelUrl);
      
      const checkout = await planService.createCheckout(planId, successUrl, cancelUrl);
      
      console.log('Checkout response:', checkout);
      
      if (!checkout) {
        throw new Error('No response from server');
      }
      
      if (!checkout.url) {
        throw new Error('Checkout URL not provided. Please check if Stripe is configured on the server.');
      }
      
      console.log('Redirecting to Stripe Checkout:', checkout.url);
      // Redirect to Stripe Checkout
      window.location.href = checkout.url;
    } catch (err) {
      processingPlanId = null;
      let errorMessage = err.message || 'Failed to start checkout. Please try again.';
      
      // Provide more helpful error messages
      if (errorMessage.includes('Payment processing is not configured')) {
        errorMessage = 'Payment processing is not configured. Please contact support.';
      } else if (errorMessage.includes('Not authenticated')) {
        errorMessage = 'Please login first to purchase tokens.';
      } else if (errorMessage.includes('Plan not found')) {
        errorMessage = 'Selected plan is not available. Please refresh the page.';
      }
      
      alert(errorMessage);
      console.error('Checkout error:', err);
    }
  }

  function formatPrice(cents) {
    return (cents / 100).toFixed(2);
  }
</script>

<svelte:head>
  <title>Subscription Plans - Token Packages</title>
</svelte:head>

<main class="container mx-auto px-4 py-8">
  <div class="text-center mb-12">
    <h1 class="text-4xl font-bold mb-4">Choose Your Plan</h1>
    <p class="text-lg text-base-content/70">
      Purchase tokens to power your job application automation
    </p>
  </div>

  {#if loading}
    <div class="flex justify-center items-center py-20">
      <span class="loading loading-spinner loading-lg"></span>
    </div>
  {:else if error}
    <div class="alert alert-error mb-8">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>Error loading plans: {error}</span>
      <button class="btn btn-sm" on:click={loadPlans}>Retry</button>
    </div>
  {:else if plans.length === 0}
    <div class="alert alert-info">
      <span>No plans available at the moment. Please check back later.</span>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
      {#each plans as plan}
        <div 
          class="card bg-base-100 shadow-xl transition-all duration-300 cursor-pointer hover:shadow-2xl {selectedPlanId === plan.planId ? 'ring-4 ring-primary ring-offset-2 bg-primary/5' : ''}"
          on:click={() => selectPlan(plan.planId)}
          on:keydown={(e) => e.key === 'Enter' && selectPlan(plan.planId)}
          role="button"
          tabindex="0"
        >
          {#if plan.isPopular}
            <div class="badge badge-primary absolute top-4 right-4 z-10">
              {plan.badge || 'Popular'}
            </div>
          {/if}
          
          {#if selectedPlanId === plan.planId}
            <div class="badge badge-success absolute top-4 left-4 z-10">
              <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
              Selected
            </div>
          {/if}
          
          <div class="card-body">
            <h2 class="card-title text-2xl mb-2">{plan.name}</h2>
            <p class="text-base-content/70 mb-4">{plan.description}</p>
            
            <div class="mb-6">
              <div class="text-4xl font-bold">
                ${formatPrice(plan.price)}
              </div>
              <div class="text-sm text-base-content/70 mt-1">
                {plan.currency.toUpperCase()}
              </div>
            </div>

            <div class="mb-6">
              <div class="text-2xl font-semibold mb-2">
                {plan.tokensIncluded + (plan.bonusTokens || 0)} Tokens
              </div>
              {#if plan.bonusTokens > 0}
                <div class="text-sm text-success">
                  {plan.tokensIncluded} base + {plan.bonusTokens} bonus
                </div>
              {/if}
            </div>

            <div class="divider"></div>

            <ul class="space-y-2 mb-6">
              {#each plan.features as feature}
                <li class="flex items-start">
                  <svg class="w-5 h-5 text-success mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  <span>{feature}</span>
                </li>
              {/each}
            </ul>

            <div class="card-actions justify-center mt-auto">
              <button 
                class="btn btn-primary btn-block {selectedPlanId === plan.planId ? 'btn-active' : ''}"
                on:click|stopPropagation={() => handlePurchase(plan.planId)}
                disabled={processingPlanId === plan.planId}
              >
                {#if processingPlanId === plan.planId}
                  <span class="loading loading-spinner loading-sm"></span>
                  Processing...
                {:else}
                  {selectedPlanId === plan.planId ? '✓ ' : ''}Buy Now
                {/if}
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <div class="mt-12 text-center">
      <div class="alert alert-info max-w-2xl mx-auto">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <div>
          <h3 class="font-bold">Token Usage</h3>
          <div class="text-sm mt-2">
            <p>• Cover Letter: 2 tokens</p>
            <p>• Resume Tailoring: 2 tokens</p>
            <p>• Q&A Generation: 1 token</p>
            <p class="mt-2">Tokens never expire. Use them whenever you need!</p>
          </div>
        </div>
      </div>
    </div>
  {/if}
</main>
