<script lang="ts">
    import type { HybridTemplate } from '$lib/data/resumeTemplates';
    import TemplateDocxPreviewImage from '$lib/components/TemplateDocxPreviewImage.svelte';
    import { downloadDocxFromUrl } from '$lib/resume-templates-catalog';

    export let template: HybridTemplate;

    let isDownloading = false;

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
    class="card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 border border-base-200 flex flex-col h-full overflow-hidden"
>
    <div class="relative overflow-hidden rounded-t-lg flex-shrink-0">
        <TemplateDocxPreviewImage
            templateId={template.id}
            previewUrl={template.previewUrl}
            alt={`Preview: ${template.title}`}
            variant="card"
        />
    </div>

    <div class="card-body p-6 bg-base-100 flex-grow border-t border-base-200 flex flex-col gap-4">
        <div class="flex justify-between items-start gap-4">
            <div>
                <h3 class="card-title text-xl font-bold text-base-content leading-tight">{template.title}</h3>
                <span class="badge badge-secondary badge-sm mt-2 font-medium capitalize">{template.category}</span>
            </div>
        </div>

        <button
            type="button"
            class="btn btn-neutral w-full shadow-md"
            disabled={isDownloading}
            on:click={downloadFile}
        >
            {#if isDownloading}
                <span class="loading loading-spinner loading-sm"></span>
                Downloading...
            {:else}
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5 mr-2 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                </svg>
                Download .DOCX
            {/if}
        </button>
    </div>
</div>
