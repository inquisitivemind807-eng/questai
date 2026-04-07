<script lang="ts">
  /**
   * Uses backend preview URL when available, otherwise falls back to static
   * preview assets under static/resume-template-previews/{templateId}.png.
   */
  interface Props {
    templateId: string;
    previewUrl?: string;
    alt?: string;
    variant?: 'card' | 'full';
  }

  let { templateId, previewUrl, alt = 'Resume template preview', variant = 'card' }: Props = $props();

  const MONGO_OBJECT_ID = /^[a-f0-9]{24}$/i;
  const PLACEHOLDER_SRC = '/resume-template-previews/placeholder.png';

  let imgSrc = $state('');
  let loadFailed = $state(false);
  let fallbackUsed = $state(false);

  $effect(() => {
    templateId;
    previewUrl;
    loadFailed = false;
    fallbackUsed = false;
    imgSrc = previewUrl
      ? previewUrl
      : MONGO_OBJECT_ID.test(templateId)
        ? PLACEHOLDER_SRC
        : `/resume-template-previews/${templateId}.png`;
  });

  function onError() {
    if (!fallbackUsed && !MONGO_OBJECT_ID.test(templateId)) {
      fallbackUsed = true;
      imgSrc = `/resume-template-previews/${templateId}.png`;
      return;
    }
    if (imgSrc !== PLACEHOLDER_SRC) {
      fallbackUsed = true;
      imgSrc = PLACEHOLDER_SRC;
    } else {
      loadFailed = true;
    }
  }
</script>

{#if variant === 'card'}
  <div
    class="flex h-[400px] w-full min-w-0 items-center justify-center overflow-hidden bg-base-200 px-4 py-4"
  >
    <div
      class="relative overflow-hidden rounded-md bg-white shadow-md ring-1 ring-neutral-900/10"
      style="aspect-ratio: 210 / 297; height: 100%; width: auto;"
    >
      {#if loadFailed}
        <div
          class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-base-200/80 px-3 text-center"
        >
          <p class="text-[10px] font-medium text-base-content/50 uppercase tracking-wider">
            Preview unavailable
          </p>
        </div>
      {:else}
        <img
          {alt}
          src={imgSrc}
          loading="lazy"
          decoding="async"
          draggable="false"
          class="block h-full w-full object-contain select-none pointer-events-none"
          onerror={onError}
        />
      {/if}
    </div>
  </div>
{:else}
  <div
    class="flex w-full min-w-0 items-center justify-center overflow-hidden bg-base-200 p-4 sm:p-8"
    style="min-height: 600px;"
  >
    <div
      class="relative overflow-hidden rounded-lg bg-white shadow-xl ring-1 ring-neutral-900/15"
      style="aspect-ratio: 210 / 297; width: min(100%, 600px); height: auto;"
    >
      {#if loadFailed}
        <div
          class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-base-200/80 px-6 text-center"
        >
          <p class="text-sm font-medium text-base-content/50 uppercase tracking-widest">
            Preview unavailable
          </p>
        </div>
      {:else}
        <img
          {alt}
          src={imgSrc}
          loading="eager"
          decoding="async"
          draggable="false"
          class="block h-full w-full object-contain select-none pointer-events-none"
          onerror={onError}
        />
      {/if}
    </div>
  </div>
{/if}
