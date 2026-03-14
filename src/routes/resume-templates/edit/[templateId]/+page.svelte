<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import { templates } from '$lib/data/resumeTemplates';
    import { createEmptyResume } from '$lib/resume/store';
    import { downloadDocx } from '$lib/resume/generator';
    import type { ResumeData } from '$lib/resume/types';
    import { getEffectiveFont, getEffectiveFontSize, getLetterSpacing, getLineSpacing } from '$lib/resume/utils/font-helpers';

    let resume: ResumeData | null = null;
    let downloading = false;
    let editingField: string | null = null;

    $: templateId = $page.params.templateId;
    $: config = templates.find(t => t.id === templateId);
    $: visualTemplate = config?.visualTemplate;

    onMount(() => {
        if (!config) {
            goto('/resume-templates');
            return;
        }

        // Initialize resume with seed data
        const base = createEmptyResume(visualTemplate?.id || 'traditional-classic-blue', config.title);
        resume = {
            ...base,
            ...config.seedData,
            personalInfo: {
                ...base.personalInfo,
                ...config.seedData.personalInfo
            }
        };
    });

    async function handleDownload() {
        if (!resume) return;
        downloading = true;
        try {
            await downloadDocx(resume, resume.title);
            alert('✅ Resume downloaded successfully!');
        } catch (error) {
            console.error('Download error:', error);
            alert('Failed to download resume.');
        } finally {
            downloading = false;
        }
    }

    function startEditing(field: string) {
        editingField = field;
    }

    function stopEditing() {
        editingField = null;
    }

    // List management helpers
    function addExperience() {
        if (!resume) return;
        resume.experience = [...resume.experience, {
            id: crypto.randomUUID(),
            company: "New Company",
            jobTitle: "New Role",
            startDate: "2024",
            endDate: "Present",
            achievements: ["Achievement 1"]
        }];
    }

    function addEducation() {
        if (!resume) return;
        resume.education = [...resume.education, {
            id: crypto.randomUUID(),
            institution: "New Institution",
            degree: "Degree",
            graduationDate: "2024"
        }];
    }

    function addSkill() {
        if (!resume) return;
        resume.skills = [...resume.skills, { 
            id: crypto.randomUUID(),
            name: "New Skill", 
            category: "Core" 
        }];
    }
</script>

<svelte:head>
    <title>Edit {config?.title || 'Resume'} | QuestAI</title>
</svelte:head>

<div class="min-h-screen bg-neutral-100 py-8 px-4">
    {#if resume && config && visualTemplate}
        <!-- Toolbar -->
        <div class="max-w-[900px] mx-auto mb-6 flex items-center justify-between bg-white p-4 rounded-xl shadow-sm sticky top-4 z-50">
            <div class="flex items-center gap-4">
                <button class="btn btn-ghost btn-sm" on:click={() => goto('/resume-templates')}>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                    </svg>
                    Templates
                </button>
                <div class="h-6 w-[1px] bg-neutral-200"></div>
                <h1 class="font-bold text-neutral-600 truncate max-w-[200px]">{config.title} Editor</h1>
            </div>

            <div class="flex gap-2">
                <button class="btn btn-primary btn-sm px-6" disabled={downloading} on:click={handleDownload}>
                    {#if downloading}
                        <span class="loading loading-spinner loading-xs"></span>
                    {:else}
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                    {/if}
                    Download .DOCX
                </button>
            </div>
        </div>

        <!-- Paper Canvas -->
        <div class="max-w-[800px] mx-auto bg-white shadow-2xl min-h-[1100px] p-12 mb-20 relative ring-1 ring-black/5"
             style:font-family={getEffectiveFont(resume, visualTemplate.style, 'body')}
             style:line-height={getLineSpacing(resume)}
             style:letter-spacing={getLetterSpacing(resume)}>
            
            <!-- Header -->
            <header class="mb-8 border-b-2 pb-6" style:border-color={visualTemplate.style.primaryColor} style:text-align={visualTemplate.style.headerAlignment}>
                <div class="group relative cursor-text p-1 hover:bg-primary/5 rounded border border-transparent hover:border-primary/20 transition-all" 
                     on:click={() => startEditing('fullName')}>
                    {#if editingField === 'fullName'}
                        <input 
                            bind:value={resume.personalInfo.fullName}
                            class="text-4xl font-bold w-full bg-transparent outline-none border-b-2 border-primary"
                            style:color={visualTemplate.style.primaryColor}
                            style:text-align={visualTemplate.style.headerAlignment}
                            autofocus
                            on:blur={stopEditing}
                        />
                    {:else}
                        <h1 class="text-4xl font-bold" style:color={visualTemplate.style.primaryColor}>
                            {resume.personalInfo.fullName}
                        </h1>
                    {/if}
                </div>

                <div class="mt-2 group relative cursor-text p-1 hover:bg-primary/5 rounded border border-transparent hover:border-primary/20 transition-all"
                     on:click={() => startEditing('title')}>
                    {#if editingField === 'title'}
                        <input 
                            bind:value={resume.personalInfo.title}
                            class="text-xl italic w-full bg-transparent outline-none border-b border-primary/50"
                            style:color={visualTemplate.style.textColor}
                            style:text-align={visualTemplate.style.headerAlignment}
                            autofocus
                            on:blur={stopEditing}
                        />
                    {:else}
                        <p class="text-xl italic text-neutral-500">
                            {resume.personalInfo.title}
                        </p>
                    {/if}
                </div>

                <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-600"
                     style:justify-content={visualTemplate.style.headerAlignment === 'center' ? 'center' : visualTemplate.style.headerAlignment === 'right' ? 'flex-end' : 'flex-start'}>
                    <p>{resume.personalInfo.email}</p>
                    <p>•</p>
                    <p>{resume.personalInfo.phone}</p>
                    <p>•</p>
                    <p>{resume.personalInfo.address}</p>
                </div>
            </header>

            <!-- Summary -->
            <section class="mb-8">
                <h2 class="text-lg font-bold uppercase tracking-widest mb-3" style:color={visualTemplate.style.primaryColor}>Professional Summary</h2>
                <div class="group relative cursor-text p-2 hover:bg-primary/5 rounded border border-transparent hover:border-primary/20 transition-all"
                     on:click={() => startEditing('summary')}>
                    {#if editingField === 'summary'}
                        <textarea 
                            bind:value={resume.summary}
                            class="w-full bg-transparent outline-none border-b border-primary/50 resize-none min-h-[100px]"
                            autofocus
                            on:blur={stopEditing}
                        />
                    {:else}
                        <p class="text-neutral-700 whitespace-pre-wrap">{resume.summary}</p>
                    {/if}
                </div>
            </section>

            <!-- Experience -->
            <section class="mb-8">
                <div class="flex items-center justify-between mb-4 border-b pb-1" style:border-color={visualTemplate.style.dividerColor}>
                    <h2 class="text-lg font-bold uppercase tracking-widest" style:color={visualTemplate.style.primaryColor}>Experience</h2>
                    <button class="btn btn-ghost btn-xs text-primary" on:click={addExperience}>+ Add Experience</button>
                </div>

                <div class="space-y-6">
                    {#each resume.experience as exp, i}
                        <div class="group relative">
                            <div class="flex justify-between items-baseline">
                                <div class="flex-grow">
                                    <div class="flex items-center gap-2">
                                        <input bind:value={exp.jobTitle} class="font-bold text-lg bg-transparent border-none outline-none hover:bg-primary/5 p-1 rounded transition-colors flex-grow" />
                                        <span class="text-neutral-400">@</span>
                                        <input bind:value={exp.company} class="text-lg bg-transparent border-none outline-none hover:bg-primary/5 p-1 rounded transition-colors flex-grow text-neutral-600" />
                                    </div>
                                    <div class="flex items-center gap-2 text-sm text-neutral-500 mt-1">
                                        <input bind:value={exp.startDate} class="w-20 bg-transparent border-none outline-none hover:bg-neutral-100 p-1 rounded transition-colors" />
                                        <p>—</p>
                                        <input bind:value={exp.endDate} class="w-20 bg-transparent border-none outline-none hover:bg-neutral-100 p-1 rounded transition-colors" />
                                    </div>
                                </div>
                                <button class="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100 text-error transition-opacity" 
                                        on:click={() => resume.experience = resume.experience.filter((_, idx) => idx !== i)}>Delete</button>
                            </div>
                            
                            <ul class="mt-3 list-disc list-inside space-y-2">
                                {#each exp.achievements as ach, ai}
                                    <li class="flex items-start gap-2 text-neutral-700">
                                        <span class="mt-1">•</span>
                                        <textarea bind:value={exp.achievements[ai]} class="flex-grow bg-transparent border-none outline-none hover:bg-neutral-50 p-1 rounded text-sm resize-none"></textarea>
                                        <button class="btn btn-ghost btn-xs text-neutral-300 hover:text-error" on:click={() => exp.achievements = exp.achievements.filter((_, idx) => idx !== ai)}>×</button>
                                    </li>
                                {/each}
                                <button class="text-xs text-primary/50 hover:text-primary mt-1" on:click={() => exp.achievements = [...exp.achievements, "New achievement"]}>+ Add Achievement</button>
                            </ul>
                        </div>
                    {/each}
                </div>
            </section>

            <!-- Education -->
            <section class="mb-8">
                <div class="flex items-center justify-between mb-4 border-b pb-1" style:border-color={visualTemplate.style.dividerColor}>
                    <h2 class="text-lg font-bold uppercase tracking-widest" style:color={visualTemplate.style.primaryColor}>Education</h2>
                    <button class="btn btn-ghost btn-xs text-primary" on:click={addEducation}>+ Add Education</button>
                </div>

                <div class="space-y-4">
                    {#each resume.education as edu, i}
                        <div class="group relative flex justify-between items-start p-2 hover:bg-neutral-50 rounded transition-colors">
                            <div class="flex-grow space-y-1">
                                <input bind:value={edu.institution} class="font-bold w-full bg-transparent border-none outline-none p-0" />
                                <div class="flex justify-between text-sm text-neutral-600">
                                    <input bind:value={edu.degree} class="bg-transparent border-none outline-none p-0 flex-grow" />
                                    <input bind:value={edu.graduationDate} class="bg-transparent border-none outline-none p-0 w-24 text-right italic" />
                                </div>
                            </div>
                            <button class="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100 text-error -mr-2" 
                                    on:click={() => resume.education = resume.education.filter((_, idx) => idx !== i)}>×</button>
                        </div>
                    {/each}
                </div>
            </section>

            <!-- Skills -->
            <section>
                <div class="flex items-center justify-between mb-4 border-b pb-1" style:border-color={visualTemplate.style.dividerColor}>
                    <h2 class="text-lg font-bold uppercase tracking-widest" style:color={visualTemplate.style.primaryColor}>Skills</h2>
                    <button class="btn btn-ghost btn-xs text-primary" on:click={addSkill}>+ Add Skill</button>
                </div>

                <div class="flex flex-wrap gap-2">
                    {#each resume.skills as skill, i}
                        <div class="group flex items-center bg-neutral-100 rounded-lg px-3 py-1 text-sm border hover:border-primary/30 transition-all">
                            <input bind:value={skill.name} class="bg-transparent border-none outline-none p-0 w-24 text-neutral-700" />
                            <button class="btn btn-ghost btn-xs h-4 w-4 min-h-0 p-0 ml-1 opacity-100 group-hover:text-error" 
                                    on:click={() => resume.skills = resume.skills.filter((_, idx) => idx !== i)}>×</button>
                        </div>
                    {/each}
                </div>
            </section>

            <!-- Hint -->
            <div class="absolute -left-32 top-32 w-24 text-right hidden xl:block">
                <p class="text-xs text-neutral-400 font-medium leading-relaxed italic">Click any text to edit directly</p>
                <div class="h-1 w-8 bg-primary/20 ml-auto mt-2"></div>
            </div>
        </div>
    {/if}
</div>

<style>
    :global(body) {
        background-color: #f5f5f5;
    }
    input::placeholder, textarea::placeholder {
        color: #d1d5db;
    }
</style>
