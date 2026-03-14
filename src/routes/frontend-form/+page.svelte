<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import {
    getManagedFiles,
    registerManagedFile,
    registerManagedBinaryFile,
  } from "$lib/file-manager";

  let formData = $state({
    fullName: "",
    email: "",
    phone: "",
    linkedinUrl: "",
    keywords: "",
    locations: "",
    minSalary: "",
    maxSalary: "",
    jobType: "any",
    experienceLevel: "any",
    industry: "",
    listedDate: "",
    remotePreference: "any",
    rightToWork: "citizen",
    rewriteResume: false,
    excludedCompanies: "",
    excludedKeywords: "",
    skillWeight: "0.4",
    locationWeight: "0.2",
    salaryWeight: "0.3",
    companyWeight: "0.1",
    enableDeepSeek: false,
    deepSeekApiKey: "",
    acceptTerms: false,
    resumeFileName: "",
    botMode: "superbot",
  });

  let formErrors: Record<string, string> = $state({});
  let isSubmitting = $state(false);
  let resumeFile: { name: string } | null = $state(null);
  let resumeUploaded = $state(false);
  let availableResumeFiles: string[] = $state([]);
  let uploadValidationMessage = $state("");
  const CORPUS_RAG_API =
    import.meta.env.VITE_PUBLIC_API_BASE ||
    import.meta.env.VITE_API_BASE ||
    "http://localhost:3000";
  const ALLOWED_RESUME_EXTENSIONS = [".doc", ".docx", ".pdf"];

  function isSupportedResumeFile(name: string): boolean {
    const lower = String(name || "").toLowerCase();
    return ALLOWED_RESUME_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  onMount(() => {
    loadConfig();
  });

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

  async function loadUploadedResumes() {
    const userEmail = (formData.email || "").trim();
    if (!userEmail) { availableResumeFiles = []; return; }
    try {
      const entries = await getManagedFiles({ userId: userEmail, feature: "resume" });
      availableResumeFiles = entries.map(e => e.filename).filter((n): n is string => typeof n === "string" && isSupportedResumeFile(n));
    } catch (error) {
      console.error("Failed to list resumes:", error);
      availableResumeFiles = [];
    }
  }

  function handleResumeSelection() {
    if (formData.resumeFileName) {
      resumeFile = { name: formData.resumeFileName };
      resumeUploaded = true;
    }
  }

  async function handleResumeUpload(event: Event) {
    const target = event.target as HTMLInputElement | null;
    const file = target?.files?.[0];
    if (file) {
      if (!isSupportedResumeFile(file.name)) {
        alert("Only .doc, .docx, and .pdf resume files are supported.");
        if (target) target.value = "";
        return;
      }
      const userEmail = (formData.email || "").trim();
      if (!userEmail) { alert("Please add your Email in Profile & Contact first."); if (target) target.value = ""; return; }
      try {
        const fileName = String(file.name || "resume.docx");
        uploadValidationMessage = "Uploading and processing resume...";
        const extractFormData = new FormData();
        extractFormData.append("file", file, fileName);
        const extractRes = await fetch(`${CORPUS_RAG_API}/api/extract-document`, { method: "POST", body: extractFormData });
        const extractData = await extractRes.json().catch(() => ({}));
        if (!extractRes.ok || extractData?.success !== true) throw new Error(extractData?.error || "Extraction failed");
        
        const arrayBuffer = await file.arrayBuffer();
        const base64Content = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));

        await registerManagedBinaryFile({
          userId: userEmail, feature: "resume", filename: fileName, contentBase64: base64Content,
          sourceRoute: "/frontend-form", mimeType: file.type || "application/octet-stream",
          tags: ["source-resume", "canonical"]
        });

        await registerManagedFile({
          userId: userEmail, feature: "resume", filename: fileName.replace(/\.(pdf|docx?|doc)$/i, ".txt"),
          content: extractData.content, sourceRoute: "/frontend-form", mimeType: "text/plain", tags: ["extracted-text"]
        });

        formData.resumeFileName = fileName;
        resumeFile = { name: fileName };
        resumeUploaded = true;
        await loadUploadedResumes();
        uploadValidationMessage = `✓ Uploaded: ${fileName}`;
        if (target) target.value = "";
        setTimeout(() => { uploadValidationMessage = ""; }, 5000);
      } catch (error) {
        console.error("Upload failed:", error);
        uploadValidationMessage = `✗ Failed: ${error}`;
        alert("Failed to upload: " + error);
        if (target) target.value = "";
      }
    }
  }

  function resetForm() {
    formData = {
      fullName: "", email: "", phone: "", linkedinUrl: "", keywords: "", locations: "",
      minSalary: "", maxSalary: "", jobType: "any", experienceLevel: "any", industry: "",
      listedDate: "", remotePreference: "any", rightToWork: "citizen", rewriteResume: false,
      excludedCompanies: "", excludedKeywords: "", skillWeight: "0.4", locationWeight: "0.2",
      salaryWeight: "0.3", companyWeight: "0.1", enableDeepSeek: false, deepSeekApiKey: "",
      acceptTerms: false, resumeFileName: "", botMode: "superbot",
    };
    resumeFile = null;
    resumeUploaded = false;
    uploadValidationMessage = "";
    formErrors = {};
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    isSubmitting = true;
    formErrors = {};
    let hasErrors = false;
    
    if (!formData.fullName?.trim()) {
      formErrors.fullName = "Full Name is required";
      hasErrors = true;
    }
    
    if (!formData.email?.trim()) {
      formErrors.email = "Email is required";
      hasErrors = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      formErrors.email = "Invalid email format";
      hasErrors = true;
    }
    
    if (!formData.phone?.trim()) {
      formErrors.phone = "Phone is required";
      hasErrors = true;
    }
    
    if (!formData.keywords?.trim()) {
      formErrors.keywords = "Keywords are required";
      hasErrors = true;
    }
    
    if (!formData.acceptTerms) {
      formErrors.acceptTerms = "You must accept the legal disclaimer";
      hasErrors = true;
    }
    
    if (hasErrors) { 
      alert("Please check the form for errors and try again.");
      isSubmitting = false; 
      return; 
    }

    if (formData.email && formData.resumeFileName) {
      const syncResult = await syncSelectedResumeToCorpus();
      if (!syncResult.success) { alert(syncResult.message); isSubmitting = false; return; }
    }
    try {
      if (await saveConfig()) {
        alert("Configuration saved successfully!");
      } else {
        throw new Error("Save failed");
      }
    } catch (error) {
      console.error("Error saving configuration:", error);
      alert("Error saving configuration. Please try again.");
    } finally {
      isSubmitting = false;
    }
  }

  async function loadConfig() {
    try {
      const content = await invoke<string>("read_file_async", { filename: "src/bots/user-bots-config.json" });
      const config = JSON.parse(content);
      if (config.formData) formData = { ...formData, ...config.formData };
      await loadUploadedResumes();
      if (formData.resumeFileName && availableResumeFiles.includes(formData.resumeFileName)) {
          resumeFile = { name: formData.resumeFileName }; resumeUploaded = true;
      } else if (availableResumeFiles.length > 0) {
          formData.resumeFileName = availableResumeFiles[0]; resumeFile = { name: availableResumeFiles[0] }; resumeUploaded = true;
      }
    } catch (error) {
      await loadUploadedResumes();
      if (availableResumeFiles.length > 0) {
        formData.resumeFileName = availableResumeFiles[0]; resumeFile = { name: availableResumeFiles[0] }; resumeUploaded = true;
      }
    }
  }

  async function saveConfig() {
    try {
      await invoke("create_directory_async", { dirname: "src/bots" }).catch(() => {});
      let config = { formData: {} };
      try {
        config = JSON.parse(await invoke<string>("read_file_async", { filename: "src/bots/user-bots-config.json" }));
      } catch {}
      config.formData = formData;
      await invoke("write_file_async", { filename: "src/bots/user-bots-config.json", content: JSON.stringify(config, null, 2) });
      return true;
    } catch (error) { return false; }
  }

  async function validateUploadedResumeForCurrentUser() {
     // Re-implemented in sync function
     return { success: true, message: "" };
  }

  async function syncSelectedResumeToCorpus() {
    const userEmail = (formData.email || "").trim();
    if (!userEmail) return { success: false, message: "Email required" };
    if (!formData.resumeFileName) return { success: false, message: "Resume required" };
    try {
      const entries = await getManagedFiles({ userId: userEmail, feature: "resume" });
      if (!entries.some(e => e.filename === formData.resumeFileName)) return { success: false, message: "Resume not found" };
      return { success: true, message: "Resume synced" };
    } catch (error) { return { success: false, message: "Sync failed" }; }
  }
</script>

<div class="min-h-screen bg-gradient-to-br from-base-200 via-base-100 to-base-300 pt-4 pb-12 px-2 sm:px-4 lg:px-6 relative overflow-hidden">
  <div class="absolute top-0 -left-4 w-96 h-96 bg-primary rounded-full mix-blend-multiply filter blur-3xl opacity-[0.02] animate-blob"></div>
  <div class="absolute top-0 -right-4 w-96 h-96 bg-secondary rounded-full mix-blend-multiply filter blur-3xl opacity-[0.02] animate-blob animation-delay-2000"></div>

  <div class="max-w-4xl mx-auto relative z-10">
    <div class="mb-4 flex justify-between items-center">
      <div>
        <h1 class="text-2xl font-bold text-base-content tracking-tight flex items-center gap-2">
          ⚙️ Configuration
        </h1>
        <p class="text-base-content/60 text-xs mt-0.5">Customize your automated job application preferences</p>
      </div>
    </div>

    <form id="config-form" onsubmit={handleSubmit} novalidate class="flex flex-col gap-4 pb-24">
      <!-- Profile & Contact -->
      <div class="card bg-base-100/90 backdrop-blur-xl border border-white/20 shadow-md hover:shadow-lg transition-all duration-300 group">
        <div class="card-body p-3">
          <h2 class="card-title text-base mb-0.5 flex items-center gap-1.5 text-base-content/90 font-bold">
            👤 Profile & Contact
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
            <div class="form-control w-full">
              <label class="label py-0" for="fullName-input">
                <span class="label-text font-semibold text-xs">Full Name *</span>
              </label>
              <input id="fullName-input" type="text" placeholder="Amit Chaulagain" bind:value={formData.fullName} class="input input-bordered input-sm w-full {formErrors.fullName ? 'input-error' : ''}" />
              {#if formErrors.fullName}<span class="text-error text-sm mt-1 ml-1">{formErrors.fullName}</span>{/if}
            </div>
            <div class="form-control w-full">
              <label class="label py-0" for="email-input">
                <span class="label-text font-semibold text-xs">Email *</span>
              </label>
              <input id="email-input" type="email" placeholder="you@example.com" bind:value={formData.email} class="input input-bordered input-sm w-full {formErrors.email ? 'input-error' : ''}" />
              {#if formErrors.email}<span class="text-error text-sm mt-1 ml-1">{formErrors.email}</span>{/if}
            </div>
            <div class="form-control w-full">
              <label class="label py-0" for="phone-input">
                <span class="label-text font-semibold text-xs">Phone *</span>
              </label>
              <input id="phone-input" type="text" placeholder="+61 4XX XXX XXX" bind:value={formData.phone} class="input input-bordered input-sm w-full {formErrors.phone ? 'input-error' : ''}" />
              {#if formErrors.phone}<span class="text-error text-sm mt-1 ml-1">{formErrors.phone}</span>{/if}
            </div>
            <div class="form-control w-full">
              <label class="label py-0" for="linkedin-url-input">
                <span class="label-text font-semibold text-xs">LinkedIn URL</span>
              </label>
              <input id="linkedin-url-input" type="url" placeholder="https://www.linkedin.com/..." bind:value={formData.linkedinUrl} class="input input-bordered input-sm w-full" />
            </div>
          </div>
        </div>
      </div>

      <!-- Job Preferences -->
      <div class="card bg-base-100/90 backdrop-blur-xl border border-white/20 shadow-md hover:shadow-lg transition-all duration-300 group">
        <div class="card-body p-3">
          <h2 class="card-title text-base mb-0.5 flex items-center gap-1.5 text-base-content/90 font-bold">
            🎯 Job Preferences
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
            <div class="form-control w-full">
              <label class="label py-0" for="keywords-input">
                <span class="label-text font-semibold text-xs">Keywords *</span>
              </label>
              <input id="keywords-input" type="text" placeholder="python, backend, api, django" bind:value={formData.keywords} class="input input-bordered input-sm w-full {formErrors.keywords ? 'input-error' : ''}" />
              {#if formErrors.keywords}<span class="text-error text-sm mt-1 ml-1">{formErrors.keywords}</span>{/if}
            </div>
            <div class="form-control w-full">
              <label class="label py-0" for="locations-input">
                <span class="label-text font-semibold text-xs">Locations</span>
              </label>
              <input id="locations-input" type="text" placeholder="Sydney, Melbourne, Remote" bind:value={formData.locations} class="input input-bordered input-sm w-full" />
            </div>
            <div class="form-control w-full">
              <label class="label py-0" for="min-salary-input">
                <span class="label-text font-semibold text-xs">Min Salary (AUD)</span>
              </label>
              <input id="min-salary-input" type="number" placeholder="80000" bind:value={formData.minSalary} class="input input-bordered input-sm w-full" />
            </div>
            <div class="form-control w-full">
              <label class="label py-0" for="max-salary-input">
                <span class="label-text font-semibold text-xs">Max Salary (AUD)</span>
              </label>
              <input id="max-salary-input" type="number" placeholder="150000" bind:value={formData.maxSalary} class="input input-bordered input-sm w-full" />
            </div>
            <div class="form-control w-full">
              <label class="label py-0" for="job-type-select">
                <span class="label-text font-semibold text-xs">Job Types</span>
              </label>
              <select id="job-type-select" bind:value={formData.jobType} class="select select-bordered select-sm w-full text-sm">
                <option value="any">Any</option>
                <option value="full-time">Full time</option>
                <option value="part-time">Part time</option>
                <option value="contract">Contract</option>
              </select>
            </div>
            <div class="form-control w-full">
              <label class="label py-0" for="experience-level-select">
                <span class="label-text font-semibold text-xs">Experience</span>
              </label>
              <select id="experience-level-select" bind:value={formData.experienceLevel} class="select select-bordered select-sm w-full text-sm">
                <option value="any">Any</option><option value="entry">Entry</option><option value="mid">Mid</option><option value="senior">Senior</option>
              </select>
            </div>
            <div class="form-control w-full">
              <label class="label py-0" for="industry-select">
                <span class="label-text font-semibold text-xs">Industries</span>
              </label>
              <select id="industry-select" bind:value={formData.industry} class="select select-bordered select-sm w-full text-sm">
                {#each industries as ind}<option value={ind.value}>{ind.label}</option>{/each}
              </select>
            </div>
            <div class="form-control w-full">
              <label class="label py-0" for="listed-date-select">
                <span class="label-text font-semibold text-xs">Job Listed On</span>
              </label>
              <select id="listed-date-select" bind:value={formData.listedDate} class="select select-bordered select-sm w-full text-sm">
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
              <label class="label py-0" for="remote-select">
                <span class="label-text font-semibold text-xs">Remote Preference</span>
              </label>
              <select id="remote-select" bind:value={formData.remotePreference} class="select select-bordered select-sm w-full text-sm">
                <option value="any">Any</option>
                <option value="on-site">On-site</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
          </div>
        </div>
      </div>

        <div class="card bg-base-100/90 backdrop-blur-xl border border-white/20 shadow-md p-3">
          <h2 class="card-title text-base mb-0.5 flex items-center gap-1.5 font-bold">🏛️ Work Rights</h2>
          <div class="form-control w-full">
            <label class="label py-0" for="right-to-work-select">
              <span class="label-text font-semibold text-xs">Australian Work Status</span>
            </label>
            <select id="right-to-work-select" name="right_to_work_in_aus" bind:value={formData.rightToWork} class="select select-bordered select-sm w-full text-sm mt-1">
              {#each workRightOptions as opt}<option value={opt.value}>{opt.label}</option>{/each}
            </select>
          </div>
        </div>

        <div class="card bg-base-100/90 backdrop-blur-xl border border-white/20 shadow-md p-3">
          <h2 class="card-title text-base mb-0.5 flex items-center gap-1.5 font-bold">🤖 Application Settings</h2>
          <div class="space-y-1">
             <label class="label cursor-pointer justify-start gap-2 py-0">
                <input type="checkbox" bind:checked={formData.rewriteResume} class="checkbox checkbox-primary checkbox-sm" />
                <span class="label-text font-semibold text-xs">Rewrite resume for each Job?</span>
             </label>
             <div class="form-control w-full">
               <select bind:value={formData.botMode} class="select select-bordered select-sm w-full text-sm">
                 <option value="superbot">🤖 Superbot (Automated)</option>
                 <option value="review">👀 Review (Pause at end)</option>
                 <option value="manual">✋ Manual (Pause always)</option>
               </select>
             </div>
          </div>
        </div>

      <!-- Resume Selection & Quality Filters Group -->
      <div class="space-y-3">
        <div class="card bg-base-100/90 backdrop-blur-xl border border-white/20 shadow-md">
          <div class="card-body p-3">
            <h2 class="card-title text-base mb-0.5 flex items-center gap-1.5 text-base-content/90 font-bold">
              📄 Resume Selection
            </h2>
            <div class="grid grid-cols-1 gap-1.5">
            <div class="form-control w-full">
              <select bind:value={formData.resumeFileName} onchange={handleResumeSelection} class="select select-bordered select-sm w-full text-sm">
                <option value="" disabled>Select a saved resume...</option>
                {#each availableResumeFiles as name}<option value={name}>{name}</option>{/each}
              </select>
            </div>
            <div class="form-control w-full">
              <label class="label py-0" for="resume-upload">
                <span class="label-text font-semibold text-xs">Choose File</span>
              </label>
              <input id="resume-upload" type="file" accept=".pdf,.doc,.docx" class="file-input file-input-bordered file-input-sm w-full text-sm" onchange={handleResumeUpload} />
            </div>
          </div>
          {#if uploadValidationMessage}<div class="text-sm mt-2 opacity-70 font-medium">{uploadValidationMessage}</div>{/if}
        </div>
      </div>

        <div class="card bg-base-100/90 backdrop-blur-xl border border-white/20 shadow-md">
          <div class="card-body p-3">
            <h2 class="card-title text-base mb-0.5 flex items-center gap-1.5 text-base-content/90 font-bold">
              🎯 Quality Filters
            </h2>
            <div class="grid grid-cols-1 gap-1.5">
            <div class="form-control w-full">
              <label class="label py-0" for="excluded-companies-input">
                <span class="label-text font-semibold text-[10px] opacity-70">Exclude Companies</span>
              </label>
              <input id="excluded-companies-input" type="text" placeholder="wipro, infosys, tcs" bind:value={formData.excludedCompanies} class="input input-bordered input-sm w-full text-sm" />
            </div>
            <div class="form-control w-full">
              <label class="label py-0" for="excluded-keywords-input">
                <span class="label-text font-semibold text-[10px] opacity-70">Exclude Keywords</span>
              </label>
              <input id="excluded-keywords-input" type="text" placeholder="junior, intern, php" bind:value={formData.excludedKeywords} class="input input-bordered input-sm w-full text-sm" />
            </div>

          </div>
        </div>
      </div>

      </div>

      <div>
        <div class="card bg-warning/5 border border-warning/10 shadow-sm">
          <div class="card-body p-1.5 flex flex-row items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <span class="text-warning text-lg">⚠️</span>
              <div class="flex flex-col">
                <span class="text-[12px] font-bold text-warning">Legal Disclaimer</span>
                <span class="text-[10px] opacity-80 leading-tight font-medium">By using this automation tool, you assume all responsibility for TOS compliance.</span>
              </div>
            </div>
            <label class="label cursor-pointer gap-2 py-0 border-l border-warning/10 pl-3">
              <input id="acceptTerms-checkbox" type="checkbox" bind:checked={formData.acceptTerms} class="checkbox checkbox-warning checkbox-sm {formErrors.acceptTerms ? 'checkbox-error' : ''}" />
              <span class="label-text font-bold text-[10px] text-warning uppercase tracking-wider">I understand and accept</span>
            </label>
          </div>
          {#if formErrors.acceptTerms}<div class="px-2 pb-1 text-error text-[10px] text-center">{formErrors.acceptTerms}</div>{/if}
        </div>
      </div>

      <!-- Sticky Footer Actions -->
      <div class="sticky bottom-0 z-40 bg-base-100/95 backdrop-blur-md border-t border-base-200/50 p-3 -mx-4 mt-6 shadow-[0_-4px_12px_rgba(0,0,0,0.1)]">
        <div class="flex justify-center items-center gap-4">
          <button type="submit" class="btn btn-primary btn-sm px-8 shadow-lg text-white border-0 bg-gradient-to-r from-primary to-secondary hover:scale-105 transition-all duration-300" disabled={isSubmitting}>
            {#if isSubmitting}
              <span class="loading loading-spinner loading-xs"></span> Saving...
            {:else}
              💾 Save Configuration
            {/if}
          </button>
          <button type="button" class="btn btn-outline btn-sm px-8 hover:bg-base-200 transition-colors" onclick={resetForm}>
            🔄 Reset Form
          </button>
        </div>
      </div>
    </form>
  </div>
</div>
