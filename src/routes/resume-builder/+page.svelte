<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { TEMPLATES } from "$lib/resume/templates";
  import { createEmptyResume, loadResumes } from "$lib/resume/store";
  import { resumesStore } from "$lib/resume/store";
  import TemplatePreview from "$lib/resume/components/TemplatePreview.svelte";

  // Load saved resumes on mount
  onMount(() => {
    loadResumes();
  });

  // Get template categories for filtering
  let selectedCategory = "all";
  const categories = [
    { id: "all", name: "All Templates" },
    { id: "traditional", name: "Traditional" },
    { id: "professional", name: "Professional" },
    { id: "clean", name: "Clean" },
    { id: "modern", name: "Modern" },
  ];

  // Filter templates based on category
  $: filteredTemplates =
    selectedCategory === "all"
      ? TEMPLATES
      : TEMPLATES.filter((t) => t.category === selectedCategory);

  // Count user's existing resumes
  $: resumeCount = $resumesStore.length;

  async function handleTemplateSelect(templateId: string) {
    // Create new resume with selected template
    const newResumeData = createEmptyResume(
      templateId,
      `My Resume ${resumeCount + 1}`,
    );

    // Add to store - this returns the stored resume with proper ID
    const storedResume = resumesStore.add(newResumeData);

    // Navigate to editor using the stored resume ID
    goto(`/resume-builder/edit/${storedResume.id}`);
  }

  function goToMyResumes() {
    goto("/resume-builder/my-resumes");
  }
</script>

<div class="container mx-auto p-8">
  <!-- Header -->
  <div class="mb-8">
    <h1 class="text-4xl font-bold text-primary mb-4">Resume Builder</h1>
    <p class="text-lg text-base-content/70 mb-4">
      Create professional ATS-friendly resumes in minutes. Choose a template to
      get started.
    </p>
    <div class="flex gap-4 items-center">
      <button class="btn btn-primary" on:click={goToMyResumes}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        My Resumes ({resumeCount})
      </button>
    </div>
  </div>

  <!-- Category Filter -->
  <div class="mb-8">
    <div class="flex flex-wrap gap-2">
      {#each categories as category}
        <button
          class="btn btn-sm {selectedCategory === category.id
            ? 'btn-primary'
            : 'btn-outline'}"
          on:click={() => (selectedCategory = category.id)}
        >
          {category.name}
        </button>
      {/each}
    </div>
  </div>

  <!-- Template Grid -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {#each filteredTemplates as template}
      <div
        class="card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer"
        on:click={() => handleTemplateSelect(template.id)}
        on:keydown={(e) =>
          e.key === "Enter" && handleTemplateSelect(template.id)}
        role="button"
        tabindex="0"
      >
        <!-- Template Preview -->
        <figure
          class="px-6 pt-6 flex items-center justify-center bg-base-200 rounded-t-lg overflow-hidden"
        >
          <div class="w-full" style="height: 400px; overflow: hidden;">
            <TemplatePreview {template} />
          </div>
        </figure>

        <div class="card-body">
          <div class="flex items-start justify-between mb-2">
            <h2 class="card-title text-xl">{template.name}</h2>
            {#if template.atsCompliant}
              <div class="badge badge-success badge-sm">ATS</div>
            {/if}
          </div>
          <p class="text-sm text-base-content/70 mb-4">
            {template.description}
          </p>

          <div class="card-actions justify-end">
            <button class="btn btn-primary btn-sm w-full">
              Use Template
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    {/each}
  </div>

  <!-- Info Section -->
  <div class="mt-16 bg-base-200 rounded-lg p-8">
    <div class="max-w-3xl mx-auto text-center">
      <h2 class="text-3xl font-bold mb-4">Why Choose Our Resume Builder?</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <div class="flex flex-col items-center">
          <div class="text-4xl mb-3">📄</div>
          <h3 class="font-semibold mb-2">ATS-Friendly</h3>
          <p class="text-sm text-base-content/70">
            All templates are optimized for Applicant Tracking Systems
          </p>
        </div>
        <div class="flex flex-col items-center">
          <div class="text-4xl mb-3">⚡</div>
          <h3 class="font-semibold mb-2">Fast & Easy</h3>
          <p class="text-sm text-base-content/70">
            Create professional resumes in minutes
          </p>
        </div>
        <div class="flex flex-col items-center">
          <div class="text-4xl mb-3">💾</div>
          <h3 class="font-semibold mb-2">Save & Edit</h3>
          <p class="text-sm text-base-content/70">
            Store multiple resumes and update anytime
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .card {
    transition: transform 0.2s ease;
  }

  .card:hover {
    transform: translateY(-4px);
  }
</style>
