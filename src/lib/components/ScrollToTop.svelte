<script>
  import { onMount, onDestroy } from 'svelte';
  
  /** @type {HTMLElement | null} */
  export let scrollContainer = null;
  
  let visible = false;
  const threshold = 300;
  let lastAttached = null;

  function handleScroll() {
    const scrollY = scrollContainer ? scrollContainer.scrollTop : window.scrollY;
    visible = scrollY > threshold;
  }

  function scrollToTop() {
    const target = scrollContainer || window;
    target.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setupListener(target) {
    if (lastAttached) {
      lastAttached.removeEventListener('scroll', handleScroll);
    }
    if (target) {
      target.addEventListener('scroll', handleScroll);
      lastAttached = target;
      handleScroll();
    }
  }

  $: if (typeof window !== 'undefined') {
    setupListener(scrollContainer || window);
  }

  onDestroy(() => {
    if (lastAttached) {
      lastAttached.removeEventListener('scroll', handleScroll);
    }
  });
</script>

{#if visible}
  <button
    on:click={scrollToTop}
    class="fixed bottom-8 right-8 z-[100] btn btn-circle btn-primary shadow-2xl transition-all duration-500 hover:scale-110 active:scale-95 group border-none backdrop-blur-md"
    aria-label="Scroll to top"
    style="background: linear-gradient(135deg, hsl(var(--p)) 0%, hsl(var(--pf)) 100%);"
  >
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      class="h-6 w-6 transition-transform duration-300 group-hover:-translate-y-1 text-primary-content" 
      fill="none" 
      viewBox="0 0 24 24" 
      stroke="currentColor"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 15l7-7 7 7" />
    </svg>
    
    <!-- Premium Glow & Ring -->
    <div class="absolute inset-0 rounded-full bg-primary/20 blur-xl -z-10 group-hover:bg-primary/40 transition-all duration-500 scale-150 opacity-0 group-hover:opacity-100"></div>
    <div class="absolute inset-0 rounded-full border-2 border-primary/30 scale-100 group-hover:scale-110 transition-transform duration-500"></div>
  </button>
{/if}

<style>
  button {
    box-shadow: 
      0 10px 25px -5px rgba(0, 0, 0, 0.4), 
      0 8px 10px -6px rgba(0, 0, 0, 0.4),
      inset 0 1px 1px rgba(255, 255, 255, 0.2);
  }
</style>
