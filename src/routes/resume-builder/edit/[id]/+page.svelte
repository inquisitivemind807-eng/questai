<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
import { resumesStore, activeResume, createExperience, createEducation, createSkill, createCertification, createProject, createLanguage, autoSave, loadResumes } from '$lib/resume/store';
import { downloadDocx } from '$lib/resume/generator';
import { getTemplateById } from '$lib/resume/templates';
import type { ResumeData } from '$lib/resume/types';
import { getEffectiveFont, getEffectiveFontSize, getLetterSpacing, getLineSpacing } from '$lib/resume/utils/font-helpers';
  
  let resume: ResumeData | null = null;
  let saving = false;
  let downloading = false;
  let editingField: string | null = null;
  
  // Get resume ID from URL
  $: resumeId = ($page.params as any).id || '';
  
  // Get template info
  $: template = resume ? getTemplateById(resume.templateId) : null;

  // Layout info (for matching template layouts in edit view)
  $: layoutType = template?.style.layoutType || 'single-column';
  $: isTwoColumnLayout =
    layoutType === 'two-column-split' || layoutType === 'two-column-sidebar';
  $: sidebarSections = template?.style.sidebarSections || [];
  $: mainSections = template?.style.mainSections || [];
  
  // Load resume reactively when ID changes
  $: if (resumeId && !resume) {
    const loadedResume = resumesStore.getById(resumeId);
    if (loadedResume) {
      resume = loadedResume;
      activeResume.set(loadedResume);
    } else if (resumeId) {
      // Resume not found, redirect
      goto('/resume-builder');
    }
  }
  
  onMount(async () => {
    // If store is empty (e.g. fresh page load), hydrate from localStorage
    if (get(resumesStore).length === 0) {
      await loadResumes();
    }

    // After hydration, try to load the resume for this ID
    if (resumeId && !resume) {
      const loadedResume = resumesStore.getById(resumeId);
      if (loadedResume) {
        resume = loadedResume;
        activeResume.set(loadedResume);
      } else {
        // If still not found, go back to template picker
        goto('/resume-builder');
      }
    }
  });
  
  // Debounced auto-save
  let saveTimeout: any = null;
  $: if (resume) {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (resume) {
        resumesStore.updateById(resumeId, resume);
        autoSave();
      }
    }, 1000);
  }
  
  async function handleSave() {
    if (!resume) return;
    saving = true;
    try {
      resumesStore.updateById(resumeId, resume);
      autoSave();
      await new Promise(resolve => setTimeout(resolve, 500));
    } finally {
      saving = false;
    }
  }
  
  async function handleDownload() {
    if (!resume) return;
    downloading = true;
    try {
      console.log('Starting download for resume:', resume.title);
      await downloadDocx(resume, resume.title);
      console.log('Download completed successfully');
      // Show success message
      alert(`✅ Resume downloaded successfully!\n\nFile: ${resume.title}.docx\nLocation: Your Downloads folder`);
    } catch (error) {
      console.error('Download error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to download resume: ${errorMessage}\n\nPlease check the browser console for more details.`);
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
  
  function addExperience() {
    if (!resume) return;
    resume.experience = [...resume.experience, createExperience()];
  }
  
  function removeExperience(index: number) {
    if (!resume) return;
    resume.experience = resume.experience.filter((_, i: number) => i !== index);
  }
  
  function addEducation() {
    if (!resume) return;
    resume.education = [...resume.education, createEducation()];
  }
  
  function removeEducation(index: number) {
    if (!resume) return;
    resume.education = resume.education.filter((_, i: number) => i !== index);
  }
  
  function addSkill() {
    if (!resume) return;
    resume.skills = [...resume.skills, createSkill()];
  }
  
  function removeSkill(index: number) {
    if (!resume) return;
    resume.skills = resume.skills.filter((_, i: number) => i !== index);
  }
  
  function addAchievement(expIndex: number) {
    if (!resume) return;
    resume.experience[expIndex].achievements = [...resume.experience[expIndex].achievements, ''];
  }
  
  function removeAchievement(expIndex: number, achIndex: number) {
    if (!resume) return;
    resume.experience[expIndex].achievements = resume.experience[expIndex].achievements.filter((_, i: number) => i !== achIndex);
  }
  
  function addCertification() {
    if (!resume) return;
    if (!resume.certifications) resume.certifications = [];
    resume.certifications = [...resume.certifications, createCertification()];
  }
  
  function removeCertification(index: number) {
    if (!resume) return;
    resume.certifications = resume.certifications?.filter((_, i: number) => i !== index) || [];
  }
  
  function addProject() {
    if (!resume) return;
    if (!resume.projects) resume.projects = [];
    resume.projects = [...resume.projects, createProject()];
  }
  
  function removeProject(index: number) {
    if (!resume) return;
    resume.projects = resume.projects?.filter((_, i: number) => i !== index) || [];
  }
  
  function addProjectDescription(projIndex: number) {
    if (!resume || !resume.projects) return;
    resume.projects[projIndex].description = [...resume.projects[projIndex].description, ''];
  }
  
  function removeProjectDescription(projIndex: number, descIndex: number) {
    if (!resume || !resume.projects) return;
    resume.projects[projIndex].description = resume.projects[projIndex].description.filter((_, i: number) => i !== descIndex);
  }
  
  function addLanguage() {
    if (!resume) return;
    if (!resume.languages) resume.languages = [];
    resume.languages = [...resume.languages, createLanguage()];
  }
  
  function removeLanguage(index: number) {
    if (!resume) return;
    resume.languages = resume.languages?.filter((_, i: number) => i !== index) || [];
  }
</script>

  <div class="w-full min-h-screen px-4 lg:px-8 py-6">
    {#if resume}
    <!-- Header -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold text-primary">Edit Resume</h1>
        <p class="text-sm text-base-content/70 mt-1">Template: {template?.name || 'Unknown'} | Click any field to edit</p>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-ghost" on:click={() => goto('/resume-builder')}>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <button class="btn btn-primary" disabled={saving} on:click={handleSave}>
          {#if saving}
            <span class="loading loading-spinner loading-sm"></span>
            Saving...
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            Save
          {/if}
        </button>
        <button class="btn btn-success" disabled={downloading} on:click={handleDownload}>
          {#if downloading}
            <span class="loading loading-spinner loading-sm"></span>
            Downloading...
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download .docx
          {/if}
        </button>
      </div>
    </div>
    
    <!-- WYSIWYG Editor -->
    <div class="card bg-white shadow-2xl">
      <div class="card-body p-6 lg:p-10" 
           style:font-family={resume && template ? getEffectiveFont(resume, template.style, 'body') : 'Arial, sans-serif'}
           style:line-height={resume ? getLineSpacing(resume) : 1.0}
           style:letter-spacing={resume ? getLetterSpacing(resume) : 'normal'}>
        <!-- Resume Header -->
        <div class="mb-8 pb-6" 
             style:text-align={template?.style.headerAlignment || 'center'}
             style:border-bottom={template?.style.headerStyle === 'underline' && template ? `2px solid ${template.style.primaryColor}` 
               : template?.style.headerStyle === 'background' && template ? `2px solid ${template.style.secondaryColor}` 
               : '2px solid #e5e7eb'}>
          <div class="mb-4 cursor-text hover:bg-gray-50 p-2 rounded transition-colors" on:click={() => startEditing('fullName')}>
            {#if editingField === 'fullName'}
              <input 
                type="text" 
                class="text-3xl font-bold border-none outline-none bg-transparent w-full"
                style:color={template?.style.primaryColor || '#000000'}
                style:font-family={resume && template ? getEffectiveFont(resume, template.style, 'header') : 'Arial, sans-serif'}
                style:font-size="{resume && template ? getEffectiveFontSize(resume, template.style, 'name') : 16}pt"
                style:font-weight={template?.style.headerFontWeight || 'bold'}
                style:text-align={template?.style.headerAlignment || 'center'}
                bind:value={resume.personalInfo.fullName}
                autofocus
                on:blur={() => stopEditing()}
              />
            {:else}
              <h1 class="text-3xl font-bold" 
                  style:color={template?.style.primaryColor || '#000000'}
                  style:font-family={resume && template ? getEffectiveFont(resume, template.style, 'header') : 'Arial, sans-serif'}
                  style:font-size="{resume && template ? getEffectiveFontSize(resume, template.style, 'name') : 16}pt"
                  style:font-weight={template?.style.headerFontWeight || 'bold'}
                  style:text-align={template?.style.headerAlignment || 'center'}>
                {resume.personalInfo.fullName || 'Your Full Name'}
              </h1>
            {/if}
          </div>
          
          <div class="mb-4 cursor-text hover:bg-gray-50 p-2 rounded transition-colors" on:click={() => startEditing('title')}>
            {#if editingField === 'title'}
              <input 
                type="text" 
                class="text-xl italic border-none outline-none bg-transparent w-full"
                style:color={template?.style.textColor || '#000000'}
                style:font-family={resume && template ? getEffectiveFont(resume, template.style, 'body') : 'Arial, sans-serif'}
                style:font-size="{resume && template ? getEffectiveFontSize(resume, template.style, 'body') : 11}pt"
                style:text-align={template?.style.headerAlignment || 'center'}
                bind:value={resume.personalInfo.title}
                autofocus
                on:blur={() => stopEditing()}
              />
            {:else}
              <h2 class="text-xl italic"
                  style:color={template?.style.textColor || '#000000'}
                  style:font-family={resume && template ? getEffectiveFont(resume, template.style, 'body') : 'Arial, sans-serif'}
                  style:font-size="{resume && template ? getEffectiveFontSize(resume, template.style, 'body') : 11}pt"
                  style:text-align={template?.style.headerAlignment || 'center'}>
                {resume.personalInfo.title || 'Your Job Title'}
              </h2>
            {/if}
          </div>
          
          <div class="text-sm flex flex-wrap gap-3 cursor-text hover:bg-gray-50 p-2 rounded transition-colors" 
               style:color={template?.style.textColor || '#000000'}
               style:font-family={resume && template ? getEffectiveFont(resume, template.style, 'contact') : 'Arial, sans-serif'}
               style:font-size="{resume && template ? getEffectiveFontSize(resume, template.style, 'contact') : 10}pt"
               style:justify-content={template?.style.headerAlignment === 'center' ? 'center' : template?.style.headerAlignment === 'right' ? 'flex-end' : 'flex-start'}
               on:click={() => startEditing('contact')}>
            {#if editingField === 'contact'}
              <input 
                type="text" 
                class="border-none outline-none bg-transparent w-full"
                style:color={template?.style.textColor || '#000000'}
                style:font-family={resume && template ? getEffectiveFont(resume, template.style, 'contact') : 'Arial, sans-serif'}
                style:font-size="{resume && template ? getEffectiveFontSize(resume, template.style, 'contact') : 10}pt"
                style:text-align={template?.style.headerAlignment || 'center'}
                bind:value={resume.personalInfo.email}
                placeholder="Email"
              />
              <span class="mx-2" style:color={template?.style.dividerColor || '#9ca3af'}>|</span>
              <input 
                type="text" 
                class="border-none outline-none bg-transparent w-full"
                style:color={template?.style.textColor || '#000000'}
                style:font-family={template?.style.contactFont || 'Arial, sans-serif'}
                style:text-align={template?.style.headerAlignment || 'center'}
                bind:value={resume.personalInfo.phone}
                placeholder="Phone"
              />
              {#if resume.personalInfo.linkedin || resume.personalInfo.github}
                <span class="mx-2" style:color={template?.style.dividerColor || '#9ca3af'}>|</span>
                <input 
                  type="text" 
                  class="border-none outline-none bg-transparent w-full"
                  style:color={template?.style.textColor || '#000000'}
                  style:font-family={template?.style.contactFont || 'Arial, sans-serif'}
                  style:text-align={template?.style.headerAlignment || 'center'}
                  bind:value={resume.personalInfo.linkedin}
                  placeholder="LinkedIn"
                />
              {/if}
            {:else}
              {resume.personalInfo.email || 'email@example.com'}
              {#if resume.personalInfo.phone}
                <span style:color={template?.style.dividerColor || '#9ca3af'}>|</span>
                {resume.personalInfo.phone}
              {/if}
              {#if resume.personalInfo.linkedin}
                <span style:color={template?.style.dividerColor || '#9ca3af'}>|</span>
                LinkedIn: {resume.personalInfo.linkedin}
              {/if}
              {#if resume.personalInfo.github}
                <span style:color={template?.style.dividerColor || '#9ca3af'}>|</span>
                GitHub: {resume.personalInfo.github}
              {/if}
            {/if}
          </div>
        </div>
        
        <!-- Main Content Sections (Summary, Experience, Education, Skills, Certifications, Projects, Languages) -->
        <div class={isTwoColumnLayout ? 'edit-two-column' : ''}>

        <!-- RIGHT COLUMN (Main content in two-column layouts) rendered first for better order -->
        <div class={isTwoColumnLayout ? 'edit-main' : ''}>

        <!-- Summary Section -->
        {#if !isTwoColumnLayout || mainSections.length === 0 || mainSections.includes('summary')}
        <div class="mb-6">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-bold uppercase tracking-wide"
                style:color={template?.style.primaryColor || '#000000'}
                style:font-family={resume && template ? getEffectiveFont(resume, template.style, 'header') : 'Arial, sans-serif'}
                style:font-size="{resume && template ? getEffectiveFontSize(resume, template.style, 'header') : 14}pt"
                style:font-weight={template?.style.headerFontWeight || 'bold'}
                style:border-bottom={template && template.style.dividerStyle === 'line' ? `1px solid ${template.style.dividerColor}` : 'none'}
                style:padding-bottom={template?.style.dividerStyle === 'line' ? '4px' : '0'}>
              Summary
            </h3>
            <button class="btn btn-xs btn-ghost" on:click={() => startEditing('summary')}>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
          <div class="text-sm leading-relaxed cursor-text hover:bg-gray-50 p-3 rounded transition-colors text-black" 
               style:font-family={resume && template ? getEffectiveFont(resume, template.style, 'body') : 'Arial, sans-serif'}
               style:font-size="{resume && template ? getEffectiveFontSize(resume, template.style, 'body') : 11}pt"
               on:click={() => startEditing('summary')}>
            {#if editingField === 'summary'}
              <textarea 
                class="w-full border-none outline-none bg-transparent resize-none min-h-[80px] text-black"
                style:font-family={resume && template ? getEffectiveFont(resume, template.style, 'body') : 'Arial, sans-serif'}
                style:font-size="{resume && template ? getEffectiveFontSize(resume, template.style, 'body') : 11}pt"
                bind:value={resume.summary}
                autofocus
                on:blur={() => stopEditing()}
                placeholder="Experienced professional with expertise in..."
              ></textarea>
            {:else}
              <p class="text-sm text-black">{resume.summary || 'Experienced professional with expertise in... (Click to edit)'}</p>
            {/if}
          </div>
        </div>
        {/if}

        <!-- Experience Section -->
        {#if !isTwoColumnLayout || mainSections.length === 0 || mainSections.includes('experience')}
        <div class="mb-6">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-bold uppercase tracking-wide"
                style:color={template?.style.primaryColor || '#000000'}
                style:font-family={template?.style.headerFont || 'Arial, sans-serif'}
                style:font-weight={template?.style.headerFontWeight || 'bold'}
                style:border-bottom={template && template.style.dividerStyle === 'line' ? `1px solid ${template.style.dividerColor}` : 'none'}
                style:padding-bottom={template?.style.dividerStyle === 'line' ? '4px' : '0'}>
              Experience
            </h3>
            <button class="btn btn-xs btn-primary font-bold" on:click={addExperience}>
              + Add
            </button>
          </div>
          
          {#if resume.experience.length === 0}
            <div class="border border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:bg-gray-50 transition-colors" on:click={addExperience}>
              <p class="text-sm text-black">Click to add your first work experience</p>
            </div>
          {:else}
            {#each resume.experience as exp, expIndex}
              <div class="mb-4 pb-4 border-b border-gray-200 last:border-0">
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <input 
                      type="text" 
                      class="text-base font-bold border-none outline-none bg-transparent cursor-text hover:bg-gray-50 p-1 rounded w-full text-black"
                      bind:value={exp.jobTitle}
                      placeholder="Job Title"
                    />
                    
                    <input 
                      type="text" 
                      class="text-sm border-none outline-none bg-transparent cursor-text hover:bg-gray-50 p-1 rounded w-full text-black"
                      bind:value={exp.company}
                      placeholder="Company Name"
                    />
                    
                    <div class="flex items-center gap-2 text-xs mt-1">
                      <input 
                        type="text" 
                        class="cursor-text hover:bg-gray-50 p-1 rounded border-none outline-none bg-transparent max-w-[100px] text-black"
                        bind:value={exp.startDate}
                        placeholder="Start Date"
                      />
                      <span>-</span>
                      <input 
                        type="text" 
                        class="cursor-text hover:bg-gray-50 p-1 rounded border-none outline-none bg-transparent max-w-[100px] text-black"
                        bind:value={exp.endDate}
                        placeholder="End Date"
                      />
                    </div>
                  </div>
                  <button class="btn btn-xs btn-error font-bold" on:click={() => removeExperience(expIndex)}>
                    Remove
                  </button>
                </div>
                
                <div class="mt-2 ml-0">
                  {#each exp.achievements as achievement, achIndex}
                    <div class="flex items-start gap-2 mb-1">
                      <span class="text-black">•</span>
                    <textarea
                      class="flex-1 text-sm border-none outline-none bg-transparent resize-none cursor-text hover:bg-gray-50 p-1 rounded text-black"
                      bind:value={exp.achievements[achIndex]}
                      placeholder="Describe your achievement..."
                    ></textarea>
                      <button class="btn btn-xs btn-error btn-square font-bold" on:click={() => removeAchievement(expIndex, achIndex)}>
                        ×
                      </button>
                    </div>
                  {/each}
                  <button class="btn btn-xs btn-outline mt-2 font-bold" on:click={() => addAchievement(expIndex)}>
                    + Add Achievement
                  </button>
                </div>
              </div>
            {/each}
          {/if}
        </div>
        {/if}

        <!-- Education Section -->
        {#if !isTwoColumnLayout || mainSections.length === 0 || mainSections.includes('education')}
        <div class="mb-6">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-bold uppercase tracking-wide"
                style:color={template?.style.primaryColor || '#000000'}
                style:font-family={template?.style.headerFont || 'Arial, sans-serif'}
                style:font-weight={template?.style.headerFontWeight || 'bold'}
                style:border-bottom={template && template.style.dividerStyle === 'line' ? `1px solid ${template.style.dividerColor}` : 'none'}
                style:padding-bottom={template?.style.dividerStyle === 'line' ? '4px' : '0'}>
              Education
            </h3>
            <button class="btn btn-xs btn-primary font-bold" on:click={addEducation}>
              + Add
            </button>
          </div>
          
          {#if resume.education.length === 0}
            <div class="border border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:bg-gray-50 transition-colors" on:click={addEducation}>
              <p class="text-sm text-black">Click to add your education</p>
            </div>
          {:else}
            {#each resume.education as edu, eduIndex}
              <div class="mb-4 pb-4 border-b border-gray-200 last:border-0">
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <input 
                      type="text" 
                      class="text-base font-bold border-none outline-none bg-transparent cursor-text hover:bg-gray-50 p-1 rounded w-full text-black"
                      bind:value={edu.degree}
                      placeholder="Degree"
                    />
                    <input 
                      type="text" 
                      class="text-sm border-none outline-none bg-transparent cursor-text hover:bg-gray-50 p-1 rounded w-full text-black"
                      bind:value={edu.institution}
                      placeholder="Institution"
                    />
                    <div class="flex items-center gap-2 text-xs mt-1">
                      <input 
                        type="text" 
                        class="border-none outline-none bg-transparent cursor-text hover:bg-gray-50 p-1 rounded max-w-[100px] text-black"
                        bind:value={edu.graduationDate}
                        placeholder="Year"
                      />
                      {#if edu.gpa}
                        <span>|</span>
                        <input 
                          type="text" 
                          class="border-none outline-none bg-transparent cursor-text hover:bg-gray-50 p-1 rounded max-w-[80px] text-black"
                          bind:value={edu.gpa}
                          placeholder="GPA"
                        />
                      {/if}
                    </div>
                  </div>
                  <button class="btn btn-xs btn-error font-bold" on:click={() => removeEducation(eduIndex)}>
                    Remove
                  </button>
                </div>
              </div>
            {/each}
          {/if}
        </div>
        {/if}

        <!-- Projects Section -->
        {#if (!isTwoColumnLayout || mainSections.length === 0 || mainSections.includes('projects')) && resume.projects && resume.projects.length > 0}
          <div class="mb-6">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-lg font-bold uppercase tracking-wide"
                  style:color={template?.style.primaryColor || '#000000'}
                  style:font-family={template?.style.headerFont || 'Arial, sans-serif'}
                  style:font-weight={template?.style.headerFontWeight || 'bold'}
                  style:border-bottom={template && template.style.dividerStyle === 'line' ? `1px solid ${template.style.dividerColor}` : 'none'}
                  style:padding-bottom={template?.style.dividerStyle === 'line' ? '4px' : '0'}>
                Projects
              </h3>
              <button class="btn btn-xs btn-primary font-bold" on:click={addProject}>
                + Add
              </button>
            </div>
            
            {#each resume.projects as project, projIndex}
              <div class="mb-4 pb-4 border-b border-gray-200 last:border-0">
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <input 
                      type="text" 
                      class="text-base font-bold border-none outline-none bg-transparent cursor-text hover:bg-gray-50 p-1 rounded w-full text-black"
                      bind:value={project.title}
                      placeholder="Project Title"
                    />
                  </div>
                  <button class="btn btn-xs btn-error font-bold" on:click={() => removeProject(projIndex)}>
                    Remove
                  </button>
                </div>
                
                <div class="mt-2 ml-0">
                  {#each project.description as desc, descIndex}
                    <div class="flex items-start gap-2 mb-1">
                      <span class="text-black">•</span>
                      <textarea
                        class="flex-1 text-sm border-none outline-none bg-transparent resize-none cursor-text hover:bg-gray-50 p-1 rounded text-black"
                        bind:value={project.description[descIndex]}
                        placeholder="Project detail..."
                      ></textarea>
                      <button class="btn btn-xs btn-error btn-square font-bold" on:click={() => removeProjectDescription(projIndex, descIndex)}>
                        ×
                      </button>
                    </div>
                  {/each}
                  <button class="btn btn-xs btn-outline mt-2 font-bold" on:click={() => addProjectDescription(projIndex)}>
                    + Add Description
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Certifications Section for templates that place it in main column (e.g. Creative Bold) -->
        {#if isTwoColumnLayout && mainSections.includes('certifications')}
        <div class="mb-6">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-bold uppercase tracking-wide"
                style:color={template?.style.primaryColor || '#000000'}
                style:font-family={template?.style.headerFont || 'Arial, sans-serif'}
                style:font-weight={template?.style.headerFontWeight || 'bold'}
                style:border-bottom={template && template.style.dividerStyle === 'line' ? `1px solid ${template.style.dividerColor}` : 'none'}
                style:padding-bottom={template?.style.dividerStyle === 'line' ? '4px' : '0'}>
              Certifications
            </h3>
            <button class="btn btn-xs btn-primary font-bold" on:click={addCertification}>
              + Add
            </button>
          </div>
          
          {#if !resume.certifications || resume.certifications.length === 0}
            <div class="border border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:bg-gray-50 transition-colors" on:click={addCertification}>
              <p class="text-sm text-black">Click to add your certifications</p>
            </div>
          {:else}
            {#each resume.certifications as cert, certIndex}
              <div class="mb-2 flex items-center gap-2">
                <span class="text-black">•</span>
                <input 
                  type="text" 
                  class="flex-1 text-sm border-none outline-none bg-transparent cursor-text hover:bg-gray-50 p-2 rounded text-black"
                  bind:value={cert.name}
                  placeholder="Certification name"
                />
                <span class="text-xs text-gray-500">|</span>
                <input 
                  type="text" 
                  class="max-w-[150px] text-xs border-none outline-none bg-transparent cursor-text hover:bg-gray-50 p-2 rounded text-black"
                  bind:value={cert.issuer}
                  placeholder="Issuer"
                />
                <span class="text-xs text-gray-500">|</span>
                <input 
                  type="text" 
                  class="max-w-[80px] text-xs border-none outline-none bg-transparent cursor-text hover:bg-gray-50 p-2 rounded text-black"
                  bind:value={cert.date}
                  placeholder="Date"
                />
                <button class="btn btn-xs btn-error font-bold" on:click={() => removeCertification(certIndex)}>
                  ×
                </button>
              </div>
            {/each}
          {/if}
        </div>
        {/if}

        <!-- Languages Section (already rendered in sidebar above for some templates) -->

        </div> <!-- end RIGHT column -->

        <!-- LEFT COLUMN (Sidebar in two-column layouts) -->
        <div class={isTwoColumnLayout ? 'edit-sidebar' : ''}>

        <!-- Skills Section (only in sidebar when template specifies it there, otherwise used in main/single-column flows) -->
        {#if !isTwoColumnLayout || sidebarSections.length === 0 || sidebarSections.includes('skills')}
        <div class="mb-6">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-bold uppercase tracking-wide"
                style:color={template?.style.primaryColor || '#000000'}
                style:font-family={template?.style.headerFont || 'Arial, sans-serif'}
                style:font-weight={template?.style.headerFontWeight || 'bold'}
                style:border-bottom={template?.style.dividerStyle === 'line' ? `1px solid ${template.style.dividerColor}` : 'none'}
                style:padding-bottom={template?.style.dividerStyle === 'line' ? '4px' : '0'}>
              Skills
            </h3>
            <button class="btn btn-xs btn-primary font-bold" on:click={addSkill}>
              + Add
            </button>
          </div>
          
          {#if resume.skills.length === 0}
            <div class="border border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:bg-gray-50 transition-colors" on:click={addSkill}>
              <p class="text-sm text-black">Click to add your skills</p>
            </div>
          {:else}
            <div class="space-y-2">
              {#each resume.skills as skill, skillIndex}
                <div class="flex items-center gap-2">
                  <input 
                    type="text" 
                    class="flex-1 text-sm border-none outline-none bg-transparent cursor-text hover:bg-gray-50 p-2 rounded text-black"
                    bind:value={skill.name}
                    placeholder="Skill name"
                  />
                  <input 
                    type="text" 
                    class="max-w-[150px] text-xs border-none outline-none bg-transparent cursor-text hover:bg-gray-50 p-2 rounded text-black"
                    bind:value={skill.category}
                    placeholder="Category"
                  />
                  <button class="btn btn-xs btn-error font-bold" on:click={() => removeSkill(skillIndex)}>
                    ×
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
        {/if}

        <!-- Certifications Section (shown in sidebar only for templates that place it there, e.g. Professional Split) -->
        {#if !isTwoColumnLayout || sidebarSections.length === 0 || sidebarSections.includes('certifications')}
        <div class="mb-6">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-bold uppercase tracking-wide"
                style:color={template?.style.primaryColor || '#000000'}
                style:font-family={template?.style.headerFont || 'Arial, sans-serif'}
                style:font-weight={template?.style.headerFontWeight || 'bold'}
                style:border-bottom={template && template.style.dividerStyle === 'line' ? `1px solid ${template.style.dividerColor}` : 'none'}
                style:padding-bottom={template?.style.dividerStyle === 'line' ? '4px' : '0'}>
              Certifications
            </h3>
            <button class="btn btn-xs btn-primary font-bold" on:click={addCertification}>
              + Add
            </button>
          </div>
          
          {#if !resume.certifications || resume.certifications.length === 0}
            <div class="border border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:bg-gray-50 transition-colors" on:click={addCertification}>
              <p class="text-sm text-black">Click to add your certifications</p>
            </div>
          {:else}
            {#each resume.certifications as cert, certIndex}
              <div class="mb-2 flex items-center gap-2">
                <span class="text-black">•</span>
                <input 
                  type="text" 
                  class="flex-1 text-sm border-none outline-none bg-transparent cursor-text hover:bg-gray-50 p-2 rounded text-black"
                  bind:value={cert.name}
                  placeholder="Certification name"
                />
                <span class="text-xs text-gray-500">|</span>
                <input 
                  type="text" 
                  class="max-w-[150px] text-xs border-none outline-none bg-transparent cursor-text hover:bg-gray-50 p-2 rounded text-black"
                  bind:value={cert.issuer}
                  placeholder="Issuer"
                />
                <span class="text-xs text-gray-500">|</span>
                <input 
                  type="text" 
                  class="max-w-[80px] text-xs border-none outline-none bg-transparent cursor-text hover:bg-gray-50 p-2 rounded text-black"
                  bind:value={cert.date}
                  placeholder="Date"
                />
                <button class="btn btn-xs btn-error font-bold" on:click={() => removeCertification(certIndex)}>
                  ×
                </button>
              </div>
            {/each}
          {/if}
        </div>
        {/if}

        <!-- Languages Section (shown in sidebar when template specifies it there) -->
        {#if !isTwoColumnLayout || sidebarSections.length === 0 || sidebarSections.includes('languages')}
        <div class="mb-6">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-bold uppercase tracking-wide"
                style:color={template?.style.primaryColor || '#000000'}
                style:font-family={template?.style.headerFont || 'Arial, sans-serif'}
                style:font-weight={template?.style.headerFontWeight || 'bold'}
                style:border-bottom={template?.style.dividerStyle === 'line' ? `1px solid ${template.style.dividerColor}` : 'none'}
                style:padding-bottom={template?.style.dividerStyle === 'line' ? '4px' : '0'}>
              Languages
            </h3>
            <button class="btn btn-xs btn-primary font-bold" on:click={addLanguage}>
              + Add
            </button>
          </div>
          
          {#if !resume.languages || resume.languages.length === 0}
            <div class="border border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:bg-gray-50 transition-colors" on:click={addLanguage}>
              <p class="text-sm text-black">Click to add your languages</p>
            </div>
          {:else}
            <div class="space-y-2">
              {#each resume.languages as language, langIndex}
                <div class="flex items-center gap-2">
                  <input 
                    type="text" 
                    class="flex-1 text-sm border-none outline-none bg-transparent cursor-text hover:bg-gray-50 p-2 rounded text-black"
                    bind:value={language.name}
                    placeholder="Language"
                  />
                  <select class="select select-sm max-w-[150px]" bind:value={language.proficiency}>
                    <option value="Native">Native</option>
                    <option value="Fluent">Fluent</option>
                    <option value="Advanced">Advanced</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Basic">Basic</option>
                  </select>
                  <button class="btn btn-xs btn-error font-bold" on:click={() => removeLanguage(langIndex)}>
                    ×
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
        {/if}
        </div> <!-- end LEFT column -->

        </div> <!-- end two-column wrapper -->
      </div>
    </div>
    
    {:else}
      <div class="text-center py-20">
        <span class="loading loading-spinner loading-lg"></span>
        <p class="mt-4">Loading resume...</p>
      </div>
    {/if}
  </div>

<style>
  /* Ensure print-friendly styling */
  @media print {
    .btn, button {
      display: none !important;
    }
  }
  
  /* Fix button text readability - override DaisyUI's purple color */
  .btn-primary, .btn-error, .btn-outline {
    color: rgb(133, 132, 189) !important;
  }
  
  /* Two-column edit layout matching professional split template */
  .edit-two-column {
    display: grid;
    grid-template-columns: 30% 70%;
    gap: 24px;
    align-items: flex-start;
  }

  .edit-sidebar {
    grid-column: 1;
  }

  .edit-main {
    grid-column: 2;
  }

  @media (max-width: 1024px) {
    .edit-two-column {
      grid-template-columns: 1fr;
    }

    .edit-sidebar,
    .edit-main {
      grid-column: 1;
    }
  }
</style>
