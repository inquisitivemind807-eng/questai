<script lang="ts">
	import { browser } from '$app/environment';
	import { afterNavigate, goto } from '$app/navigation';
	import type { HybridTemplate } from '$lib/data/resumeTemplates';
	import TemplateDocxPreviewImage from '$lib/components/TemplateDocxPreviewImage.svelte';
	import { downloadDocxFromUrl, loadResumeTemplatesCatalog } from '$lib/resume-templates-catalog';

	let config: HybridTemplate | undefined;
	let checked = false;
	let isDownloading = false;

	async function resolveTemplate(id: string) {
		if (!browser || !id) return;
		checked = false;
		config = undefined;
		try {
			const list = await loadResumeTemplatesCatalog();
			const found = list.find((t) => t.id === id);
			if (!found) {
				await goto('/resume-templates');
				return;
			}
			config = found;
		} catch (e) {
			console.error(e);
			await goto('/resume-templates');
		} finally {
			checked = true;
		}
	}

	afterNavigate(({ to }) => {
		if (!browser) return;
		const id = to?.params?.templateId;
		if (typeof id === 'string' && id) void resolveTemplate(id);
	});

	async function downloadFile() {
		if (!config || isDownloading) return;
		isDownloading = true;
		try {
			await downloadDocxFromUrl(config.downloadUrl);
		} catch (error) {
			console.error('Download error:', error);
			alert('Failed to download resume template.');
		} finally {
			isDownloading = false;
		}
	}
</script>

<svelte:head>
	<title>{config ? `${config.title} — Download` : 'Resume template'} | QuestAI</title>
</svelte:head>

<div class="min-h-screen bg-neutral-100 py-8 px-4">
	{#if config}
		<div class="max-w-3xl mx-auto">
			<div class="flex flex-wrap items-center justify-between gap-4 mb-6">
				<div class="flex items-center gap-4">
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						on:click={() => goto('/resume-templates')}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 mr-2"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M15 19l-7-7 7-7"
							/>
						</svg>
						Templates
					</button>
					<div class="h-6 w-px bg-neutral-200"></div>
					<h1 class="text-lg font-bold text-neutral-800 truncate max-w-[min(100vw-12rem,28rem)]">
						{config.title}
					</h1>
				</div>

				<button
					type="button"
					class="btn btn-primary"
					disabled={isDownloading}
					on:click={downloadFile}
				>
					{#if isDownloading}
						<span class="loading loading-spinner loading-sm"></span>
						Downloading...
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5 mr-2"
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

			<div class="rounded-xl border border-base-200 bg-base-100 shadow-lg overflow-hidden">
				<TemplateDocxPreviewImage
					templateId={config.id}
					previewUrl={config.previewUrl}
					alt={`Preview: ${config.title}`}
					variant="full"
				/>
			</div>
		</div>
	{:else if checked}
		<!-- redirect in flight -->
	{/if}
</div>
