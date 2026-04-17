<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  interface Props {
    urls: string[];
    title: string;
    autoPlaySpeed?: number;
  }

  let { urls, title, autoPlaySpeed = 2500 }: Props = $props();

  let currentIndex = $state(0);
  let interval: ReturnType<typeof setInterval> | null = null;

  function startRotation() {
    if (urls.length <= 1) return;
    stopRotation();
    interval = setInterval(() => {
      currentIndex = (currentIndex + 1) % urls.length;
    }, autoPlaySpeed);
  }

  function stopRotation() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  }

  function nextSlide(e: MouseEvent) {
    e.stopPropagation();
    currentIndex = (currentIndex + 1) % urls.length;
    stopRotation();
  }

  function prevSlide(e: MouseEvent) {
    e.stopPropagation();
    currentIndex = (currentIndex - 1 + urls.length) % urls.length;
    stopRotation();
  }

  function goToSlide(index: number, e: MouseEvent) {
    e.stopPropagation();
    currentIndex = index;
    stopRotation();
  }

  onDestroy(() => {
    stopRotation();
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div 
  class="relative w-full h-full overflow-hidden bg-base-200 group/carousel"
  onmouseenter={startRotation}
  onmouseleave={stopRotation}
>
  {#if urls.length > 0}
    <div class="relative w-full h-full">
      {#each urls as url, i}
        <div 
          class="absolute inset-0 transition-opacity duration-500 ease-in-out"
          style="opacity: {currentIndex === i ? '1' : '0'}; z-index: {currentIndex === i ? '10' : '0'}"
        >
          <img
            src={url}
            alt={`Preview ${i + 1} for ${title}`}
            class="w-full h-full object-contain pointer-events-none select-none"
            loading={i === 0 ? 'eager' : 'lazy'}
          />
        </div>
      {/each}

      {#if urls.length > 1}
        <!-- Navigation Arrows -->
        <div class="absolute inset-0 z-20 flex items-center justify-between px-2 opacity-0 group-hover/carousel:opacity-100 transition-opacity duration-300">
          <button 
            type="button"
            onclick={prevSlide} 
            class="btn btn-circle btn-xs bg-base-100/90 border-none hover:bg-base-100 shadow-md transition-all scale-90 hover:scale-100"
            aria-label="Previous slide"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button 
            type="button"
            onclick={nextSlide} 
            class="btn btn-circle btn-xs bg-base-100/90 border-none hover:bg-base-100 shadow-md transition-all scale-90 hover:scale-100"
            aria-label="Next slide"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <!-- Pagination Dots -->
        <div class="absolute bottom-3 left-0 right-0 z-20 flex justify-center gap-1.5 opacity-0 group-hover/carousel:opacity-100 transition-opacity duration-300">
          {#each urls as _, i}
            <button
              type="button"
              class="w-1.5 h-1.5 rounded-full transition-all duration-300 {currentIndex === i ? 'bg-primary w-4' : 'bg-base-content/40 hover:bg-base-content/60'}"
              onclick={(e) => goToSlide(i, e)}
              aria-label={`Go to slide ${i + 1}`}
            ></button>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <div class="absolute inset-0 flex items-center justify-center text-base-content/30 text-sm italic">
      No preview available
    </div>
  {/if}
</div>

<style>
  /* Optional: smoothing for image scale if we want zoom on hover, but keeping it clean for now */
</style>
