<script lang="ts">
    import { templates, categories } from '$lib/data/resumeTemplates';
    import TemplateCard from '$lib/components/TemplateCard.svelte';

    let selectedCategory = "all";

    $: filteredTemplates = selectedCategory === "all" 
        ? templates 
        : templates.filter(t => (t as any).category === selectedCategory);
</script>

<svelte:head>
    <title>Professional Resume Templates | QuestAI</title>
</svelte:head>

<div class="min-h-screen bg-base-200 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto space-y-12">
        
        <!-- Header Section -->
        <div class="text-center space-y-4">
            <h1 class="text-4xl md:text-5xl font-extrabold tracking-tight text-base-content">
                Professional <span class="text-primary">Resume Templates</span>
            </h1>
            <p class="text-lg text-base-content/70 max-w-2xl mx-auto">
                Stand out from the crowd with our professionally designed resume templates. 
                Choose a template that fits your profession and download it to get started.
            </p>
        </div>

        <!-- Main Content Area with Sidebar -->
        <div class="flex flex-col lg:flex-row gap-8">
            
            <!-- Sidebar Navigation -->
            <div class="lg:w-64 flex-shrink-0">
                <div class="bg-base-100 rounded-xl shadow-sm p-4 sticky top-6">
                    <h2 class="text-lg font-bold mb-4 px-4">Categories</h2>
                    <ul class="menu bg-base-100 w-full rounded-box">
                        {#each categories as category}
                            <li>
                                <button 
                                    class="{selectedCategory === category.id ? 'active shadow-sm font-semibold' : ''}"
                                    on:click={() => selectedCategory = category.id}
                                >
                                    {category.name}
                                    <span class="badge badge-sm">{category.id === 'all' ? templates.length : templates.filter(t => (t as any).category === category.id).length}</span>
                                </button>
                            </li>
                        {/each}
                    </ul>
                </div>
            </div>

            <!-- Grid Area -->
            <div class="flex-grow">
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                    {#each filteredTemplates as template (template.id)}
                        <div class="animate-fade-in-up">
                            <TemplateCard {template} />
                        </div>
                    {/each}
                    
                    {#if filteredTemplates.length === 0}
                        <div class="col-span-full py-12 text-center text-base-content/50 bg-base-100 rounded-xl shadow-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p class="text-xl font-medium">No templates found in this category.</p>
                        </div>
                    {/if}
                </div>
            </div>

        </div>
    </div>
</div>

<style>
    .animate-fade-in-up {
        animation: fadeInUp 0.5s ease-out forwards;
    }

    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style>
