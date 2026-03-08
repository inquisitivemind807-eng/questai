<script lang="ts">
    import { goto } from '$app/navigation';
    import type { HybridTemplate } from '$lib/data/resumeTemplates';
    import TemplatePreview from '$lib/resume/components/TemplatePreview.svelte';

    export let template: HybridTemplate;

    let isDownloading = false;

    async function downloadFile() {
        if (isDownloading) return;
        isDownloading = true;

        try {
            const response = await fetch(template.downloadUrl);
            if (!response.ok) throw new Error('Failed to fetch file');
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            const filename = template.downloadUrl.split('/').pop() || 'resume.docx';
            a.download = decodeURIComponent(filename);
            
            document.body.appendChild(a);
            a.click();
            
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Download error:', error);
            alert('Failed to download resume template.');
        } finally {
            isDownloading = false;
        }
    }

    function useTemplate() {
        // Navigate to the dedicated standalone editor with pre-filled content
        goto(`/resume-templates/edit/${template.id}`);
    }
</script>

<div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 border border-base-200 group flex flex-col h-full overflow-hidden">
    <!-- Visual Preview (Builder style but for static DOCX reference) -->
    <figure class="relative px-6 pt-6 flex items-center justify-center bg-base-200 rounded-t-lg overflow-hidden flex-shrink-0 cursor-pointer" on:click={useTemplate} on:keydown={(e) => e.key === 'Enter' && useTemplate()} role="button" tabindex="0">
        <div class="w-full flex justify-center translate-y-8 group-hover:translate-y-4 transition-transform duration-500" style="height: 380px; overflow: hidden; pointer-events: none;">
            <div style="transform: scale(0.65); transform-origin: top center; width: 800px;">
                <TemplatePreview template={template.visualTemplate} />
            </div>
        </div>
        
        <!-- Hover Overlay -->
        <div class="absolute inset-0 bg-base-300/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col gap-4 items-center justify-center z-10 p-10">
            <button on:click|stopPropagation={useTemplate} class="btn btn-primary w-full shadow-lg font-bold">
                Use Template
            </button>
            <button on:click|stopPropagation={downloadFile} class="btn btn-outline btn-neutral w-full shadow-lg bg-base-100" disabled={isDownloading}>
                {#if isDownloading}
                    <span class="loading loading-spinner loading-sm"></span>
                    Downloading...
                {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download .DOCX
                {/if}
            </button>
        </div>
    </figure>

    <div class="card-body p-6 bg-base-100 flex-grow border-t border-base-200">
        <div class="flex justify-between items-start gap-4 mb-2">
            <div>
                <h3 class="card-title text-xl font-bold text-base-content leading-tight">{template.title}</h3>
                <span class="badge badge-secondary badge-sm mt-2 font-medium capitalize">{template.category}</span>
            </div>
        </div>
        <p class="text-xs text-base-content/50 uppercase tracking-widest font-semibold mt-auto">Editable Word Document</p>
    </div>
</div>
