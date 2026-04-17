<script lang="ts">
    import type { HybridTemplate } from '$lib/data/resumeTemplates';
    import { downloadDocxFromUrl } from '$lib/resume-templates-catalog';

    interface Props {
        template: HybridTemplate;
    }

    let { template }: Props = $props();
    let currentIndex = $state(0);
    let isDownloading = $state(false);

    const images = $derived(
        template.previewUrls && template.previewUrls.length > 0 
            ? template.previewUrls 
            : (template.previewUrl ? [template.previewUrl] : [])
    );

    function next(e: Event) {
        e.stopPropagation();
        if (images.length <= 1) return;
        currentIndex = (currentIndex + 1) % images.length;
    }

    function prev(e: Event) {
        e.stopPropagation();
        if (images.length <= 1) return;
        currentIndex = (currentIndex - 1 + images.length) % images.length;
    }

    function setIndex(e: Event, index: number) {
        e.stopPropagation();
        currentIndex = index;
    }

    async function downloadFile() {
        if (isDownloading) return;
        isDownloading = true;

        try {
            await downloadDocxFromUrl(template.downloadUrl);
        } catch (error) {
            console.error('Download error:', error);
            alert('Failed to download resume template.');
        } finally {
            isDownloading = false;
        }
    }
</script>

<div
    class="card bg-base-100 shadow-lg hover:shadow-2xl transition-all duration-500 border border-base-200/60 flex flex-col h-full overflow-hidden group/card"
>
    <!-- Preview Area -->
    <div class="relative overflow-hidden flex-shrink-0 bg-base-200/20">
        <div class="h-[420px] w-full border-b border-base-100 flex items-center justify-center p-6 relative group/slider">
            <!-- Glassmorphism Background Accent -->
            <div class="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5 opacity-0 group-hover/card:opacity-100 transition-opacity duration-700"></div>

            {#if images.length > 0}
                <div class="relative h-full w-full flex items-center justify-center pointer-events-none group-hover/slider:scale-[1.02] transition-transform duration-500">
                    <img
                        src={images[currentIndex]}
                        alt={`Preview ${currentIndex + 1} for ${template.title}`}
                        class="h-full w-full object-contain shadow-2xl rounded-sm transition-all duration-500 pointer-events-auto"
                        loading="lazy"
                    />
                </div>

                {#if images.length > 1}
                    <button
                        type="button"
                        class="absolute left-3 top-1/2 -translate-y-1/2 btn btn-circle btn-sm border-none bg-base-100/80 backdrop-blur-md shadow-md text-base-content hover:bg-base-100 opacity-0 group-hover/slider:opacity-100 transition-all duration-300 z-10 translate-x-[-10px] group-hover/slider:translate-x-0"
                        onclick={prev}
                        aria-label="Previous image"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>

                    <button
                        type="button"
                        class="absolute right-3 top-1/2 -translate-y-1/2 btn btn-circle btn-sm border-none bg-base-100/80 backdrop-blur-md shadow-md text-base-content hover:bg-base-100 opacity-0 group-hover/slider:opacity-100 transition-all duration-300 z-10 translate-x-[10px] group-hover/slider:translate-x-0"
                        onclick={next}
                        aria-label="Next image"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
                        </svg>
                    </button>

                    <div class="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2 p-2 px-3 rounded-full bg-base-800/10 backdrop-blur-xl border border-white/20 opacity-0 group-hover/slider:opacity-100 transition-all duration-500 z-10 translate-y-[10px] group-hover/slider:translate-y-0">
                        {#each images as _, i}
                            <button
                                type="button"
                                class="w-1.5 h-1.5 rounded-full transition-all duration-500 {i === currentIndex ? 'bg-primary w-5' : 'bg-base-content/20 hover:bg-base-content/40'}"
                                onclick={(e) => setIndex(e, i)}
                                aria-label={`Go to image ${i + 1}`}
                            ></button>
                        {/each}
                    </div>
                {/if}
            {:else}
                <div class="flex flex-col items-center gap-4 text-base-content/20 scale-110">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="0.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span class="text-sm font-medium tracking-wide uppercase opacity-50">No Preview</span>
                </div>
            {/if}
        </div>
    </div>

    <!-- Content Area -->
    <div class="card-body p-6 bg-base-100 flex-grow flex flex-col gap-4 relative">
        <div class="space-y-1.5">
            <div class="flex justify-between items-start">
                <h3 class="text-xl font-bold text-base-content leading-tight group-hover/card:text-primary transition-colors duration-300" title={template.title}>
                    {template.title}
                </h3>
                <div class="badge badge-secondary badge-outline font-bold uppercase tracking-tighter text-[10px] px-2 h-5">NEW</div>
            </div>
            <div class="flex items-center gap-2">
                <span class="badge badge-ghost badge-sm font-semibold text-base-content/60 py-0 h-5 px-2 rounded">{template.category}</span>
            </div>
        </div>

        {#if template.description}
            <p class="text-sm text-base-content/60 line-clamp-2 leading-relaxed h-10 font-medium">
                {template.description}
            </p>
        {:else}
            <p class="text-sm text-base-content/30 italic line-clamp-2 leading-relaxed h-10 font-normal">
                An elegant {template.category.toLowerCase()} resume template optimized for impact.
            </p>
        {/if}

        <div class="mt-auto space-y-4 pt-2">
            <div class="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-base-content/40 border-t border-base-100 pt-4">
                <div class="flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>DOCX TEMPLATE</span>
                </div>
                <span>Professional</span>
            </div>

            <button
                type="button"
                class="btn btn-primary btn-md w-full shadow-lg shadow-primary/20 font-bold tracking-wide group-hover/card:scale-[1.01] active:scale-[0.98] transition-all duration-300"
                disabled={isDownloading}
                onclick={downloadFile}
            >
                {#if isDownloading}
                    <span class="loading loading-spinner loading-sm"></span>
                    Preparing...
                {:else}
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 mr-2 shrink-0 group-hover/card:translate-y-0.5 transition-transform"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2.5"
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                    </svg>
                    Download Template
                {/if}
            </button>
        </div>
    </div>
</div>

<style>
    /* Premium Hover Accents */
    .card:hover {
        border-color: var(--p);
    }
</style>
