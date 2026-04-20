<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { page } from '$app/stores';
  import { profileService } from '$lib/services/profileService';
  import { authService } from '$lib/authService';
  import { getManagedFiles, registerManagedBinaryFile, registerManagedFile } from '$lib/file-manager';
  import { invoke } from '@tauri-apps/api/core';
  import { goto } from '$app/navigation';

  let profile: any = null;
  let isLoading = true;
  let isSaving = false;
  let errorMsg = '';
  let activeTab = 'resume'; // resume, keywords, questions

  // Resume state
  let resumeFilename = '';
  let availableResumeFiles: string[] = [];
  let uploadStatus = '';
  let isUploading = false;
  const ALLOWED_RESUME_EXTENSIONS = ['.doc', '.docx', '.pdf'];
  const CORPUS_RAG_API = import.meta.env.VITE_PUBLIC_API_BASE || import.meta.env.VITE_API_BASE || "http://localhost:3000";

  // Keywords state
  let newKeyword = '';
  let newLocation = '';
  let newExcludedCompany = '';
  let newExcludedKeyword = '';

  // Questions state
  let questionsTab = 'basic'; // generic, basic, specific
  let newBasicField = '';
  let newBasicValue = '';
  let newSpecificQuestion = '';
  let newSpecificAnswer = '';

  const MAX_QUESTIONS = 50;

  const industries = [
    { value: "", label: "Select an industry" },
    { value: "1_accounting", label: "Accounting" },
    { value: "2_administration", label: "Administration & Office Support" },
    { value: "3_advertising", label: "Advertising, Arts & Media" },
    { value: "4_banking", label: "Banking & Financial Services" },
    { value: "5_call", label: "Call Centre & Customer Service" },
    { value: "6_ceo", label: "CEO & General Management" },
    { value: "7_community", label: "Community Services & Development" },
    { value: "8_construction", label: "Construction" },
    { value: "9_consulting", label: "Consulting & Strategy" },
    { value: "10_design", label: "Design & Architecture" },
    { value: "11_education", label: "Education & Training" },
    { value: "12_engineering", label: "Engineering" },
    { value: "13_farming", label: "Farming, Animals & Conservation" },
    { value: "14_government", label: "Government & Defence" },
    { value: "15_healthcare", label: "Healthcare & Medical" },
    { value: "16_hospitality", label: "Hospitality & Tourism" },
    { value: "17_human", label: "Human Resources & Recruitment" },
    { value: "18_information", label: "Information & Communication Technology" },
    { value: "19_insurance", label: "Insurance & Superannuation" },
    { value: "20_legal", label: "Legal" },
    { value: "21_manufacturing", label: "Manufacturing, Transport & Logistics" },
    { value: "22_marketing", label: "Marketing & Communications" },
    { value: "23_mining", label: "Mining, Resources & Energy" },
    { value: "24_real", label: "Real Estate & Property" },
    { value: "25_retail", label: "Retail & Consumer Products" },
    { value: "26_sales", label: "Sales" },
    { value: "27_science", label: "Science & Technology" },
    { value: "28_self_employment", label: "Self Employment" },
    { value: "29_sport", label: "Sport & Recreation" },
    { value: "30_trades", label: "Trades & Services" },
  ];

  const workRightOptions = [
    { value: "citizen", label: "I'm an Australian citizen" },
    { value: "permanent_resident", label: "I'm a permanent resident and/or NZ citizen" },
    { value: "partner_visa", label: "I have a family/partner visa with no restrictions" },
    { value: "graduate_visa", label: "I have a graduate temporary work visa" },
    { value: "holiday_visa", label: "I have a holiday temporary work visa" },
    { value: "regional_visa", label: "I have a temporary visa with restrictions on location (e.g. Skilled Regional 491)" },
    { value: "protection_visa", label: "I have a temporary protection/safe haven work visa" },
    { value: "doctoral_visa", label: "I have a temporary visa with no restrictions (e.g. Doctoral)" },
    { value: "hour_restricted_visa", label: "I have a temporary visa with restricted hours (e.g. Student)" },
    { value: "industry_restricted_visa", label: "I have a temporary visa with restricted industry (e.g. activity visa 408)" },
    { value: "sponsorship_required", label: "I require sponsorship to work for a new employer (e.g. 482, 457)" },
  ];

  onMount(async () => {
    await fetchProfile();
    await loadAvailableResumes();
  });

  async function fetchProfile() {
    isLoading = true;
    errorMsg = '';
    try {
      profile = await profileService.getProfile($page.params.id);
      resumeFilename = profile.resume?.filename || '';
      
      // Defaults for new fields
      if (!profile.keywords) profile.keywords = [];
      if (!profile.locations) profile.locations = [];
      if (!profile.excludedCompanies) profile.excludedCompanies = [];
      if (!profile.excludedKeywords) profile.excludedKeywords = [];
      if (!profile.questions) profile.questions = { basicInfo: [], profileSpecific: [] };
      if (!profile.jobType) profile.jobType = 'any';
      if (!profile.experienceLevel) profile.experienceLevel = 'any';
      if (!profile.remotePreference) profile.remotePreference = 'any';
      if (!profile.industry) profile.industry = '';
      if (!profile.listedDate) profile.listedDate = 'any';
      if (!profile.minSalary) profile.minSalary = '';
      if (!profile.maxSalary) profile.maxSalary = '';
      if (profile.rewriteResume === undefined) profile.rewriteResume = false;
      if (!profile.botMode) profile.botMode = 'superbot';

      // Ensure boss-specified explicit basic info fields are present
      const requiredBasicFields = ['Name', 'Email', 'Phone Number', 'Expected Salary', 'Work Rights', 'Notice Period'];
      requiredBasicFields.forEach(field => {
        if (!profile.questions.basicInfo.find((b: any) => b.field.toLowerCase() === field.toLowerCase())) {
          profile.questions.basicInfo.unshift({ field, value: '' });
        }
      });

      // SYNC WITH GLOBAL CONFIG IF EMPTY
      try {
        const configStr = await invoke<string>("read_file_async", { filename: "src/bots/user-bots-config.json" });
        if (configStr) {
          const config = JSON.parse(configStr);
          const formData = config.formData;
          if (formData) {
            let changed = false;
            const mapping: Record<string, string> = {
              'Name': formData.fullName,
              'Email': formData.email,
              'Phone Number': formData.phone,
              'Work Rights': formData.rightToWork
            };

            profile.questions.basicInfo.forEach((info: any) => {
              const globalValue = mapping[info.field];
              if (globalValue && (info.value === '' || !info.value)) {
                info.value = globalValue;
                changed = true;
              }
            });

            if (changed) {
              await saveProfile();
            }
          }
        }
      } catch (err) {
        console.warn('Could not sync with global config:', err);
      }

    } catch (err: any) {
      errorMsg = err.message || 'Failed to load profile';
    } finally {
      isLoading = false;
    }
  }

  async function saveProfile() {
    isSaving = true;
    errorMsg = '';
    try {
      const updates = {
        resume: { ...profile.resume, filename: resumeFilename },
        keywords: profile.keywords,
        locations: profile.locations,
        excludedCompanies: profile.excludedCompanies,
        excludedKeywords: profile.excludedKeywords,
        jobType: profile.jobType,
        experienceLevel: profile.experienceLevel,
        remotePreference: profile.remotePreference,
        industry: profile.industry,
        listedDate: profile.listedDate,
        minSalary: profile.minSalary,
        maxSalary: profile.maxSalary,
        rewriteResume: profile.rewriteResume,
        botMode: profile.botMode,
        questions: profile.questions,
        isActive: profile.isActive
      };
      profile = await profileService.updateProfile(profile._id, updates);
    } catch (err: any) {
      errorMsg = err.message || 'Failed to save profile';
    } finally {
      isSaving = false;
    }
  }

  async function setAsSelected() {
    isSaving = true;
    errorMsg = '';
    try {
      profile = await profileService.updateProfile(profile._id, { isSelected: true });
    } catch (err: any) {
      errorMsg = err.message || 'Failed to select active profile';
    } finally {
      isSaving = false;
    }
  }

  async function deleteProfile() {
    if (!confirm('Are you sure you want to delete this profile? This cannot be undone.')) return;
    try {
      await profileService.deleteProfile(profile._id);
      goto('/profiles');
    } catch (err: any) {
      errorMsg = err.message || 'Failed to delete profile';
    }
  }

  // Resume logic
  async function loadAvailableResumes() {
    const user = $authService.user;
    if (!user?.email) return;
    try {
      const entries = await getManagedFiles({ userId: user.email, feature: 'resume' });
      availableResumeFiles = entries
        .map(e => e.filename)
        .filter((n): n is string => typeof n === 'string' && ALLOWED_RESUME_EXTENSIONS.some(ext => n.toLowerCase().endsWith(ext)));
    } catch (err) {
      console.error('Failed to load resumes:', err);
    }
  }

  function handleResumeSelection() {
    saveProfile();
  }

  async function handleResumeUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    const user = $authService.user;
    if (!file || !user?.email) return;

    if (!ALLOWED_RESUME_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))) {
      alert('Only .doc, .docx, and .pdf resume files are supported.');
      return;
    }

    isUploading = true;
    uploadStatus = 'Uploading and processing...';
    try {
      const fileName = file.name;
      
      // Extract text for RAG (matches canonical pattern)
      const extractFormData = new FormData();
      extractFormData.append('file', file, fileName);
      const extractRes = await fetch(`${CORPUS_RAG_API}/api/extract-document`, { method: 'POST', body: extractFormData });
      const extractData = await extractRes.json();
      
      if (!extractRes.ok || extractData?.success !== true) {
        throw new Error(extractData?.error || 'Extraction failed');
      }

      // Register binary
      const arrayBuffer = await file.arrayBuffer();
      const base64Content = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
      
      await registerManagedBinaryFile({
        userId: user.email,
        feature: 'resume',
        filename: fileName,
        contentBase64: base64Content,
        sourceRoute: `/profiles/${$page.params.id}`,
        mimeType: file.type || 'application/octet-stream',
        tags: ['source-resume', 'canonical']
      });

      // Register text
      await registerManagedFile({
        userId: user.email,
        feature: 'resume',
        filename: fileName.replace(/\.(pdf|docx?|doc)$/i, '.txt'),
        content: extractData.content,
        sourceRoute: `/profiles/${$page.params.id}`,
        mimeType: 'text/plain',
        tags: ['extracted-text']
      });

      resumeFilename = fileName;
      await loadAvailableResumes();
      await saveProfile();
      uploadStatus = `✓ Uploaded: ${fileName}`;
      setTimeout(() => uploadStatus = '', 5000);
    } catch (err: any) {
      console.error('Upload failed:', err);
      uploadStatus = `✗ Failed: ${err.message}`;
    } finally {
      isUploading = false;
      target.value = '';
    }
  }

  // Keywords logic
  function addKeyword() {
    const k = newKeyword.trim();
    if (k && !profile.keywords.includes(k)) {
      profile.keywords = [...profile.keywords, k];
      newKeyword = '';
      saveProfile();
    }
  }
  function removeKeyword(index: number) {
    profile.keywords = profile.keywords.filter((_: any, i: number) => i !== index);
    saveProfile();
  }

  // Locations logic
  function addLocation() {
    const l = newLocation.trim();
    if (l && !profile.locations.includes(l)) {
      profile.locations = [...profile.locations, l];
      newLocation = '';
      saveProfile();
    }
  }
  function removeLocation(index: number) {
    profile.locations = profile.locations.filter((_: any, i: number) => i !== index);
    saveProfile();
  }

  // Quality Filters logic
  function addExcludedCompany() {
    const c = newExcludedCompany.trim();
    if (c && !profile.excludedCompanies.includes(c)) {
      profile.excludedCompanies = [...profile.excludedCompanies, c];
      newExcludedCompany = '';
      saveProfile();
    }
  }
  function removeExcludedCompany(index: number) {
    profile.excludedCompanies = profile.excludedCompanies.filter((_: any, i: number) => i !== index);
    saveProfile();
  }

  function addExcludedKeyword() {
    const k = newExcludedKeyword.trim();
    if (k && !profile.excludedKeywords.includes(k)) {
      profile.excludedKeywords = [...profile.excludedKeywords, k];
      newExcludedKeyword = '';
      saveProfile();
    }
  }
  function removeExcludedKeyword(index: number) {
    profile.excludedKeywords = profile.excludedKeywords.filter((_: any, i: number) => i !== index);
    saveProfile();
  }

  // Questions logic
  function addBasicInfo() {
    const field = newBasicField.trim();
    const value = newBasicValue.trim();
    if (field && value) {
      profile.questions.basicInfo = [...profile.questions.basicInfo, { field, value }];
      newBasicField = '';
      newBasicValue = '';
      saveProfile();
    }
  }
  function removeBasicInfo(index: number) {
    profile.questions.basicInfo = profile.questions.basicInfo.filter((_: any, i: number) => i !== index);
    saveProfile();
  }
  function updateBasicInfo(index: number, e: Event, key: 'field'|'value') {
    const input = e.target as HTMLInputElement;
    profile.questions.basicInfo[index][key] = input.value;
  }

  function addSpecificQuestion() {
    const question = newSpecificQuestion.trim();
    const answer = newSpecificAnswer.trim();
    if (question && answer) {
      profile.questions.profileSpecific = [...profile.questions.profileSpecific, { question, answer }];
      newSpecificQuestion = '';
      newSpecificAnswer = '';
      saveProfile();
    }
  }
  function removeSpecificQuestion(index: number) {
    profile.questions.profileSpecific = profile.questions.profileSpecific.filter((_: any, i: number) => i !== index);
    saveProfile();
  }
  function updateSpecificQuestion(index: number, e: Event, key: 'question'|'answer') {
    const input = e.target as HTMLInputElement;
    profile.questions.profileSpecific[index][key] = input.value;
  }

</script>

<svelte:head>
  <title>{profile ? profile.profileName : 'Profile'} | Quest Bot</title>
</svelte:head>

<div class="p-6 max-w-7xl mx-auto space-y-6">
  <div class="text-sm breadcrumbs mb-4 text-base-content/70">
    <ul>
      <li><a href="/profiles">Profiles</a></li>
      <li>{profile ? profile.profileName : 'Loading...'}</li>
    </ul>
  </div>

  {#if isLoading}
    <div class="flex justify-center p-12">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>
  {:else if profile}
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h1 class="text-3xl font-bold {profile.isActive ? 'text-base-content' : 'text-base-content/50'} flex items-center gap-3">
          {profile.profileName}
          {#if profile.isSelected}
            <div class="badge badge-primary">Active Profile</div>
          {/if}
          {#if !profile.isActive}
            <div class="badge badge-ghost">Disabled</div>
          {/if}
        </h1>
        <p class="text-base-content/70 mt-1">Created at {new Date(profile.createdAt).toLocaleDateString()}</p>
      </div>
      <div class="flex items-center gap-4">
        <div class="tooltip" data-tip={profile.isActive ? "Disable Profile" : "Enable Profile"}>
          <input type="checkbox" class="toggle toggle-sm {profile.isActive ? 'toggle-success' : ''}" bind:checked={profile.isActive} on:change={saveProfile} />
        </div>
        
        {#if !profile.isSelected}
          <button class="btn btn-primary btn-sm btn-outline" disabled={!profile.isActive} on:click={setAsSelected}>Set as Active</button>
        {/if}

        <button class="btn btn-error btn-outline btn-sm" on:click={deleteProfile}>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          Delete
        </button>
      </div>
    </div>

    {#if errorMsg}
      <div class="alert alert-error">
        <span>{errorMsg}</span>
      </div>
    {/if}

    <div class="tabs tabs-boxed mt-4 justify-start overflow-x-auto whitespace-nowrap bg-base-200">
      <button class="tab {activeTab === 'resume' ? 'tab-active' : ''}" on:click={() => activeTab = 'resume'}>Resume Setup</button>
      <button class="tab {activeTab === 'keywords' ? 'tab-active' : ''}" on:click={() => activeTab = 'keywords'}>Search Keywords</button>
      <button class="tab {activeTab === 'setup' ? 'tab-active' : ''}" on:click={() => activeTab = 'setup'}>Search Setup</button>
      <button class="tab {activeTab === 'questions' ? 'tab-active' : ''}" on:click={() => activeTab = 'questions'}>Q&A Setup</button>
    </div>

    <div class="card bg-base-100 shadow-xl border border-base-300">
      <div class="card-body">
        {#if activeTab === 'resume'}
          <h2 class="card-title text-xl mb-4">Resume Configuration</h2>
          <p class="text-base-content/60 mb-6 max-w-2xl">Specify which resume should be used for this profile track. When bots run using this profile, they will upload this specific resume document.</p>
          
          <div class="space-y-6 max-w-lg">
            <div class="form-control w-full">
              <label class="label"><span class="label-text font-semibold">Select from Managed Resumes</span></label>
              <select 
                bind:value={resumeFilename} 
                on:change={handleResumeSelection}
                class="select select-bordered w-full"
              >
                <option value="" disabled>Choose a resume...</option>
                {#each availableResumeFiles as name}
                  <option value={name}>{name}</option>
                {/each}
              </select>
              <label class="label">
                <span class="label-text-alt text-base-content/50">Only files tracked in your Files Manager appear here.</span>
              </label>
            </div>

            <div class="divider">OR</div>

            <div class="form-control w-full">
              <label class="label"><span class="label-text font-semibold">Upload New Resume</span></label>
              <input 
                type="file" 
                accept=".pdf,.doc,.docx"
                on:change={handleResumeUpload}
                disabled={isUploading}
                class="file-input file-input-bordered file-input-primary w-full"
              />
              {#if uploadStatus}
                <label class="label">
                  <span class="label-text-alt font-medium {uploadStatus.includes('✗') ? 'text-error' : 'text-success'}">{uploadStatus}</span>
                </label>
              {/if}
            </div>
          </div>
        
        {:else if activeTab === 'keywords'}
          <h2 class="card-title text-xl mb-4">Targeted Keywords</h2>
          <p class="text-base-content/60 mb-6 max-w-2xl">The bot uses these keywords to search and filter for jobs relevant to this specific profile (e.g., "AI Engineer", "Machine Learning").</p>
          
          <div class="flex gap-2 mb-6 max-w-lg">
            <input 
              type="text" 
              bind:value={newKeyword} 
              on:keyup={(e) => e.key === 'Enter' && addKeyword()}
              placeholder="Add new keyword..." 
              class="input input-bordered w-full"
            />
            <button class="btn btn-primary" on:click={addKeyword} disabled={!newKeyword.trim()}>Add</button>
          </div>

          <div class="flex flex-wrap gap-2">
            {#each profile.keywords as keyword, i}
              <div class="badge badge-lg badge-neutral gap-2 p-4">
                <span>{keyword}</span>
                <button class="btn btn-ghost btn-xs btn-circle text-base-content/50 hover:text-error" on:click={() => removeKeyword(i)}>
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            {:else}
              <div class="text-base-content/40 italic py-4">No keywords added yet. Bots need keywords to search for jobs.</div>
            {/each}
          </div>

        {:else if activeTab === 'setup'}
          <div class="flex flex-col gap-8">
            <div>
              <h2 class="card-title text-xl mb-4">Job Preferences & Search Parameters</h2>
              <p class="text-base-content/60 mb-6 max-w-2xl">Define exactly what kind of roles the bot should target for this specific persona. These settings override your global configuration when this profile is active.</p>
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="form-control w-full">
                  <label class="label"><span class="label-text font-semibold">Job Type</span></label>
                  <select bind:value={profile.jobType} on:change={saveProfile} class="select select-bordered w-full">
                    <option value="any">Any</option>
                    <option value="full-time">Full time</option>
                    <option value="part-time">Part time</option>
                    <option value="contract">Contract</option>
                  </select>
                </div>

                <div class="form-control w-full">
                  <label class="label"><span class="label-text font-semibold">Experience Level</span></label>
                  <select bind:value={profile.experienceLevel} on:change={saveProfile} class="select select-bordered w-full">
                    <option value="any">Any</option>
                    <option value="entry">Entry</option>
                    <option value="mid">Mid</option>
                    <option value="senior">Senior</option>
                  </select>
                </div>

                <div class="form-control w-full">
                  <label class="label"><span class="label-text font-semibold">Remote Preference</span></label>
                  <select bind:value={profile.remotePreference} on:change={saveProfile} class="select select-bordered w-full">
                    <option value="any">Any</option>
                    <option value="on-site">On-site</option>
                    <option value="remote">Remote</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>

                <div class="form-control w-full">
                  <label class="label"><span class="label-text font-semibold">Industry</span></label>
                  <select bind:value={profile.industry} on:change={saveProfile} class="select select-bordered w-full">
                    {#each industries as ind}
                      <option value={ind.value}>{ind.label}</option>
                    {/each}
                  </select>
                </div>

                <div class="form-control w-full">
                  <label class="label"><span class="label-text font-semibold">Job Listed Within</span></label>
                  <select bind:value={profile.listedDate} on:change={saveProfile} class="select select-bordered w-full">
                    <option value="any">Any Time</option>
                    <option value="today">Today</option>
                    <option value="last_24_hours">Last 24 Hours</option>
                    <option value="last_3_days">Last 3 Days</option>
                    <option value="last_7_days">Last 7 Days</option>
                    <option value="last_14_days">Last 14 Days</option>
                    <option value="last_30_days">Last 30 Days</option>
                  </select>
                </div>

                <div class="form-control w-full">
                   <div class="flex gap-4">
                     <div class="flex-1">
                       <label class="label"><span class="label-text font-semibold">Min Salary (AUD)</span></label>
                       <input type="number" bind:value={profile.minSalary} on:blur={saveProfile} placeholder="80000" class="input input-bordered w-full" />
                     </div>
                     <div class="flex-1">
                       <label class="label"><span class="label-text font-semibold">Max Salary (AUD)</span></label>
                       <input type="number" bind:value={profile.maxSalary} on:blur={saveProfile} placeholder="150000" class="input input-bordered w-full" />
                     </div>
                   </div>
                </div>
              </div>
            </div>

            <div class="divider"></div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
              <!-- Locations -->
              <div class="space-y-4">
                <h3 class="font-bold text-lg flex items-center gap-2">📍 Target Locations</h3>
                <div class="flex gap-2 max-w-md">
                  <input type="text" bind:value={newLocation} on:keyup={(e) => e.key === 'Enter' && addLocation()} placeholder="e.g. Remote, Sydney" class="input input-bordered input-sm w-full" />
                  <button class="btn btn-primary btn-sm" on:click={addLocation} disabled={!newLocation.trim()}>Add</button>
                </div>
                <div class="flex flex-wrap gap-2">
                  {#each profile.locations as loc, i}
                    <div class="badge badge-outline gap-2 p-3">
                      <span>{loc}</span>
                      <button class="btn btn-ghost btn-xs btn-circle text-base-content/50 hover:text-error" on:click={() => removeLocation(i)}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  {:else}
                    <div class="text-base-content/40 italic text-sm">Global defaults will be used.</div>
                  {/each}
                </div>
              </div>

              <!-- Excluded Companies -->
              <div class="space-y-4">
                <h3 class="font-bold text-lg flex items-center gap-2">🚫 Exclude Companies</h3>
                <div class="flex gap-2 max-w-md">
                  <input type="text" bind:value={newExcludedCompany} on:keyup={(e) => e.key === 'Enter' && addExcludedCompany()} placeholder="e.g. Wipro, Infosys" class="input input-bordered input-sm w-full" />
                  <button class="btn btn-primary btn-sm" on:click={addExcludedCompany} disabled={!newExcludedCompany.trim()}>Add</button>
                </div>
                <div class="flex flex-wrap gap-2">
                  {#each profile.excludedCompanies as comp, i}
                    <div class="badge badge-error badge-outline gap-2 p-3">
                      <span>{comp}</span>
                      <button class="btn btn-ghost btn-xs btn-circle text-error/50 hover:text-error" on:click={() => removeExcludedCompany(i)}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  {:else}
                    <div class="text-base-content/40 italic text-sm">No companies excluded.</div>
                  {/each}
                </div>
              </div>
            </div>

            <div class="divider"></div>

            <div>
              <h2 class="card-title text-xl mb-4 text-primary">Automation & Logic Settings</h2>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                <div class="form-control bg-base-200 p-4 rounded-xl border border-base-300">
                  <label class="label cursor-pointer justify-start gap-4">
                    <input type="checkbox" bind:checked={profile.rewriteResume} on:change={saveProfile} class="checkbox checkbox-primary" />
                    <span class="label-text font-bold">Rewrite Resume for each Job?</span>
                  </label>
                  <p class="text-xs text-base-content/60 mt-1 ml-10">If enabled, the bot will use AI to tailor your resume specifically to every single job description it finds.</p>
                </div>

                <div class="form-control bg-base-200 p-4 rounded-xl border border-base-300">
                  <label class="label py-0 mb-2"><span class="label-text font-bold">Bot Operating Mode</span></label>
                  <select bind:value={profile.botMode} on:change={saveProfile} class="select select-sm select-bordered w-full">
                    <option value="superbot">🤖 Superbot (Fully Automated)</option>
                    <option value="review">👀 Review Mode (Manual Pause)</option>
                    <option value="manual">✋ Manual Mode (Step-by-step)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

        {:else if activeTab === 'questions'}
          <div class="tabs tabs-bordered w-full mb-6">
            <button class="tab {questionsTab === 'basic' ? 'tab-active font-bold text-primary' : ''} !w-1/3" on:click={() => questionsTab = 'basic'}>Basic Info / GK</button>
            <button class="tab {questionsTab === 'specific' ? 'tab-active font-bold text-primary' : ''} !w-1/3" on:click={() => questionsTab = 'specific'}>Profile-Specific Questions</button>
            <button class="tab {questionsTab === 'generic' ? 'tab-active font-bold text-primary' : ''} !w-1/3" on:click={() => questionsTab = 'generic'}>Generic Questions</button>
          </div>

          {#if questionsTab === 'basic'}
            <div class="mb-4">
              <h3 class="font-bold text-lg">General Knowledge / Basic Info</h3>
              <p class="text-sm text-base-content/60">Fixed fields that applications constantly ask for. E.g., Notice Period, Clearances, Location, Work Rights.</p>
            </div>
            
            <div class="mb-6 bg-base-200 p-4 rounded-xl max-w-3xl">
              <div class="flex flex-col md:flex-row gap-2">
                <input type="text" bind:value={newBasicField} placeholder="Field (e.g. Expected Salary)" class="input input-sm input-bordered md:w-1/3" />
                <input type="text" bind:value={newBasicValue} on:keyup={(e) => e.key === 'Enter' && addBasicInfo()} placeholder="Value (e.g. $120,000)" class="input input-sm input-bordered md:flex-1" />
                <button class="btn btn-sm btn-primary" on:click={addBasicInfo} disabled={!newBasicField || !newBasicValue}>Add Info</button>
              </div>
            </div>

            <div class="space-y-3 max-w-3xl">
              {#each profile.questions.basicInfo as info, i}
                <div class="flex gap-2 items-center bg-base-100 p-2 rounded border border-base-200 shadow-sm transition-colors hover:border-base-300 group">
                  <input type="text" value={info.field} on:blur={(e) => { updateBasicInfo(i, e, 'field'); saveProfile(); }} class="input input-sm bg-transparent border-none flex-1 font-semibold focus:bg-base-200 px-2" />
                  <span class="text-base-content/30">=</span>
                  <input type="text" value={info.value} on:blur={(e) => { updateBasicInfo(i, e, 'value'); saveProfile(); }} class="input input-sm bg-transparent border-none flex-[2] focus:bg-base-200 px-2" />
                  <button class="btn btn-ghost btn-sm btn-circle text-base-content/40 hover:text-error opacity-0 group-hover:opacity-100 transition-opacity" on:click={() => removeBasicInfo(i)}>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              {:else}
                <div class="text-base-content/40 italic p-4 text-center border-2 border-dashed border-base-300 rounded-lg">No basic info added for this profile.</div>
              {/each}
            </div>

          {:else if questionsTab === 'specific'}
            <div class="mb-4">
              <h3 class="font-bold text-lg">Profile-Specific Questions</h3>
              <p class="text-sm text-base-content/60">If an application asks questions tailored strictly to this career track (e.g. tech stack for Developers, tools for Designers).</p>
            </div>
            
            <div class="mb-6 bg-base-200 p-4 rounded-xl">
              <div class="flex flex-col gap-2">
                <input type="text" bind:value={newSpecificQuestion} placeholder="Question Keyword/Phrase (e.g. Frameworks you use)" class="input input-sm input-bordered w-full" />
                <textarea bind:value={newSpecificAnswer} placeholder="Your detailed answer" class="textarea textarea-sm textarea-bordered w-full"></textarea>
                <div class="flex justify-end">
                  <button class="btn btn-sm btn-primary" on:click={addSpecificQuestion} disabled={!newSpecificQuestion || !newSpecificAnswer}>Add Track Question</button>
                </div>
              </div>
            </div>

            <div class="space-y-4">
              {#each profile.questions.profileSpecific as specific, i}
                <div class="bg-base-100 p-4 rounded-lg border border-base-200 shadow-sm relative group">
                  <div class="form-control w-full mb-2">
                    <label class="label py-0"><span class="label-text text-xs opacity-70">If question matches:</span></label>
                    <input type="text" value={specific.question} on:blur={(e) => { updateSpecificQuestion(i, e, 'question'); saveProfile(); }} class="input input-ghost input-sm font-semibold p-1 h-auto min-h-0 focus:bg-base-200" />
                  </div>
                  <div class="form-control w-full">
                    <label class="label py-0"><span class="label-text text-xs opacity-70">Answer with:</span></label>
                    <textarea class="textarea textarea-ghost p-1 text-sm resize-none focus:bg-base-200 h-auto" rows="2" value={specific.answer} on:blur={(e) => { updateSpecificQuestion(i, e, 'answer'); saveProfile(); }}></textarea>
                  </div>
                  <button class="btn btn-error btn-circle btn-sm absolute -top-2 -right-2 shadow opacity-0 group-hover:opacity-100 transition-opacity" on:click={() => removeSpecificQuestion(i)}>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              {:else}
                <div class="text-base-content/40 italic p-6 text-center border-2 border-dashed border-base-300 rounded-lg">No specific questions for this profile. Focus on questions that vary across your career tracks.</div>
              {/each}
            </div>

          {:else if questionsTab === 'generic'}
            <div class="mb-4">
              <h3 class="font-bold text-lg flex items-center gap-2">
                Shared Generic Questions
                <div class="badge badge-outline badge-primary">Global</div>
              </h3>
              <p class="text-sm text-base-content/60">These questions are managed in the global Generic Questions library and are shared across <strong>ALL</strong> your profiles automatically.</p>
            </div>
            
            <div class="bg-primary/5 rounded-xl border border-primary/20 p-6 flex flex-col items-center justify-center text-center mt-6">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-primary opacity-50 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              <h4 class="font-semibold text-lg">Centralised Q&A</h4>
              <p class="text-base-content/70 mt-2 max-w-md">Edit your global Generic Questions to set fallback answers for common questions that are identical no matter which profile you use.</p>
              <a href="/generic-questions" class="btn btn-outline border-base-content/20 bg-base-100 hover:bg-base-200 mt-6 shadow-sm">
                Manage Global Generic Questions
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
            </div>
          {/if}
        {/if}

        <div class="absolute top-4 right-4 flex items-center">
          <!-- svelte-ignore element_invalid_action -->
          <span class="text-xs font-semibold px-2 py-1 rounded bg-base-200 transition-opacity duration-300 {isSaving ? 'opacity-100' : 'opacity-0'}">Saving...</span>
        </div>
      </div>
    </div>
  {/if}
</div>
