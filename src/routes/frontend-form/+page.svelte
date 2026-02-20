<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from "@tauri-apps/api/core"
  import { env } from '$env/dynamic/public';
  import { registerManagedFile } from '$lib/file-manager';
  
  let formData = {
    fullName: '',
    email: '',
    phone: '',
    linkedinUrl: '',
    keywords: '',
    locations: '',
    minSalary: '',
    maxSalary: '',
    jobType: 'any',
    experienceLevel: 'any',
    industry: '',
    listedDate: '',
    remotePreference: 'any',
    rightToWork: 'citizen',
    rewriteResume: false,
    excludedCompanies: '',
    excludedKeywords: '',
    skillWeight: '0.4',
    locationWeight: '0.2',
    salaryWeight: '0.3',
    companyWeight: '0.1',
    enableDeepSeek: false,
    deepSeekApiKey: '',
    acceptTerms: false,
    resumeFileName: ''
  };

  let isAdvancedMode = false;
  let showSmartMatching = false;
  let showDeepSeek = false;
  let isSubmitting = false;
  let resumeFile: { name: string } | null = null;
  let resumeUploaded = false;
  let availableResumeFiles: string[] = [];
  let uploadValidationMessage = '';
  const CORPUS_RAG_API = env.PUBLIC_API_BASE || import.meta.env.VITE_API_BASE || 'http://localhost:3000';
  const ALLOWED_RESUME_EXTENSIONS = ['.doc', '.docx', '.pdf'];

  function isSupportedResumeFile(name: string): boolean {
    const lower = String(name || '').toLowerCase();
    return ALLOWED_RESUME_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  onMount(() => {
    loadConfig();
  });

  const industries = [
    { value: '', label: 'Select an industry' },
    { value: '1_accounting', label: 'Accounting' },
    { value: '2_administration', label: 'Administration & Office Support' },
    { value: '3_advertising', label: 'Advertising, Arts & Media' },
    { value: '4_banking', label: 'Banking & Financial Services' },
    { value: '5_call', label: 'Call Centre & Customer Service' },
    { value: '6_ceo', label: 'CEO & General Management' },
    { value: '7_community', label: 'Community Services & Development' },
    { value: '8_construction', label: 'Construction' },
    { value: '9_consulting', label: 'Consulting & Strategy' },
    { value: '10_design', label: 'Design & Architecture' },
    { value: '11_education', label: 'Education & Training' },
    { value: '12_engineering', label: 'Engineering' },
    { value: '13_farming', label: 'Farming, Animals & Conservation' },
    { value: '14_government', label: 'Government & Defence' },
    { value: '15_healthcare', label: 'Healthcare & Medical' },
    { value: '16_hospitality', label: 'Hospitality & Tourism' },
    { value: '17_human', label: 'Human Resources & Recruitment' },
    { value: '18_information', label: 'Information & Communication Technology' },
    { value: '19_insurance', label: 'Insurance & Superannuation' },
    { value: '20_legal', label: 'Legal' },
    { value: '21_manufacturing', label: 'Manufacturing, Transport & Logistics' },
    { value: '22_marketing', label: 'Marketing & Communications' },
    { value: '23_mining', label: 'Mining, Resources & Energy' },
    { value: '24_real', label: 'Real Estate & Property' },
    { value: '25_retail', label: 'Retail & Consumer Products' },
    { value: '26_sales', label: 'Sales' },
    { value: '27_science', label: 'Science & Technology' },
    { value: '28_self_employment', label: 'Self Employment' },
    { value: '29_sport', label: 'Sport & Recreation' },
    { value: '30_trades', label: 'Trades & Services' }
  ];

  const workRightOptions = [
    { value: 'citizen', label: "I'm an Australian citizen" },
    { value: 'permanent_resident', label: "I'm a permanent resident and/or NZ citizen" },
    { value: 'partner_visa', label: 'I have a family/partner visa with no restrictions' },
    { value: 'graduate_visa', label: 'I have a graduate temporary work visa' },
    { value: 'holiday_visa', label: 'I have a holiday temporary work visa' },
    { value: 'regional_visa', label: 'I have a temporary visa with restrictions on work location (e.g. skilled regional visa 491)' },
    { value: 'protection_visa', label: 'I have a temporary protection or safe haven enterprise work visa' },
    { value: 'doctoral_visa', label: 'I have a temporary visa with no restrictions (e.g. doctoral student)' },
    { value: 'hour_restricted_visa', label: 'I have a temporary visa with restrictions on work hours (e.g. student visa, retirement visa)' },
    { value: 'industry_restricted_visa', label: 'I have a temporary visa with restrictions on industry (e.g. temporary activity visa 408)' },
    { value: 'sponsorship_required', label: 'I require sponsorship to work for a new employer (e.g. 482, 457)' }
  ];

  function toggleAdvancedMode() {
    isAdvancedMode = !isAdvancedMode;
  }

  function toggleSmartMatching() {
    showSmartMatching = !showSmartMatching;
  }

  function toggleDeepSeek() {
    showDeepSeek = !showDeepSeek;
  }

  function handleToggleKeydown(event: KeyboardEvent, toggleFunction: () => void) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleFunction();
    }
  }

  async function loadUploadedResumes() {
    const userEmail = (formData.email || '').trim();
    if (!userEmail) {
      availableResumeFiles = [];
      return;
    }
    try {
      const listRes = await fetch(`${CORPUS_RAG_API}/api/upload?userId=${encodeURIComponent(userEmail)}`);
      if (!listRes.ok) {
        availableResumeFiles = [];
        return;
      }
      const listData = await listRes.json();
      const fileNames = (Array.isArray(listData?.files) ? listData.files : [])
        .map((f: any) => f?.name)
        .filter((name: unknown): name is string => typeof name === 'string' && isSupportedResumeFile(name));
      availableResumeFiles = fileNames;
    } catch (error) {
      console.error('Failed to list uploaded resumes:', error);
      availableResumeFiles = [];
    }
  }

  async function handleResumeUpload(event: Event) {
    const target = event.target as HTMLInputElement | null;
    const file = target?.files?.[0];
    if (file) {
      if (!isSupportedResumeFile(file.name)) {
        alert('Only .doc, .docx, and .pdf resume files are supported.');
        return;
      }
      const userEmail = (formData.email || '').trim();
      if (!userEmail) {
        alert('Please add your Email in Profile & Contact before uploading resume.');
        return;
      }
      try {
        const fileName = String(file.name || 'resume.docx');
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const uploadFormData = new FormData();
        uploadFormData.append('file', file, sanitizedFileName);
        uploadFormData.append('userId', userEmail);
        const uploadRes = await fetch(`${CORPUS_RAG_API}/api/upload`, {
          method: 'POST',
          body: uploadFormData
        });
        const uploadData = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok || uploadData?.success !== true) {
          throw new Error(uploadData?.error || `Upload failed (${uploadRes.status})`);
        }

        formData.resumeFileName = sanitizedFileName;
        resumeFile = { name: sanitizedFileName };
        resumeUploaded = true;
        await loadUploadedResumes();
        await syncUploadedResumeToLocalFiles(userEmail, sanitizedFileName);
      } catch (error) {
        console.error('Failed to upload resume:', error);
        alert('Failed to upload resume file');
      }
    }
  }

  async function syncUploadedResumeToLocalFiles(userEmail: string, filename: string) {
    try {
      const contentRes = await fetch(
        `${CORPUS_RAG_API}/api/upload?userId=${encodeURIComponent(userEmail)}&filename=${encodeURIComponent(filename)}`
      );
      if (!contentRes.ok) return;
      const contentData = await contentRes.json();
      const content = typeof contentData?.content === 'string' ? contentData.content : '';
      if (!content.trim()) return;
      await registerManagedFile({
        userId: userEmail,
        feature: 'resume',
        filename: `${filename}.txt`,
        content,
        sourceRoute: '/frontend-form',
        mimeType: 'text/plain',
        tags: ['uploaded-resume', 'snapshot']
      });
    } catch (error) {
      console.warn('Unable to mirror uploaded resume to local Files Manager:', error);
    }
  }

  function resetForm() {
    formData = {
      fullName: '',
      email: '',
      phone: '',
      linkedinUrl: '',
      keywords: '',
      locations: '',
      minSalary: '',
      maxSalary: '',
      jobType: 'any',
      experienceLevel: 'any',
      industry: '',
      listedDate: '',
      remotePreference: 'any',
      rightToWork: 'citizen',
      rewriteResume: false,
      excludedCompanies: '',
      excludedKeywords: '',
      skillWeight: '0.4',
      locationWeight: '0.2',
      salaryWeight: '0.3',
      companyWeight: '0.1',
      enableDeepSeek: false,
      deepSeekApiKey: '',
      acceptTerms: false,
      resumeFileName: ''
    };
    resumeFile = null;
    resumeUploaded = false;
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    
    console.log('Form data at submit:', formData);
    
    if (!formData.keywords.trim()) {
      alert('Keywords are required');
      return;
    }

    if (!formData.acceptTerms) {
      alert('You must accept the legal disclaimer to continue');
      return;
    }

    const syncResult = await syncSelectedResumeToCorpus();
    if (!syncResult.success) {
      alert(syncResult.message);
      uploadValidationMessage = syncResult.message;
      return;
    }

    const uploadValidation = await validateUploadedResumeForCurrentUser();
    if (!uploadValidation.success) {
      alert(uploadValidation.message);
      uploadValidationMessage = uploadValidation.message;
      return;
    }
    uploadValidationMessage = `${syncResult.message} ${uploadValidation.message}`.trim();

    isSubmitting = true;
    
    try {
      console.log('Saving form data:', formData);
      const saved = await saveConfig();
      if (saved) {
        console.log('Form submitted successfully:', formData);
        alert('Configuration saved successfully!');
      } else {
        throw new Error('Failed to save configuration');
      }
    } catch (error) {
      console.error('Error saving configuration:', error);
      alert('Error saving configuration. Please try again.');
    } finally {
      isSubmitting = false;
    }
  }

  function validateWeight(event: Event) {
    const target = event.target as HTMLInputElement | null;
    const value = parseFloat(target?.value || '0');
    if (value < 0 || value > 1) {
      if (target) target.value = String(Math.max(0, Math.min(1, value)));
    }
  }

  async function loadConfig() {
    try {
      console.log('Loading config from project bots directory');
      const configContent = await invoke<string>("read_file_async", { 
        filename: "src/bots/user-bots-config.json" 
      });
      const config = JSON.parse(configContent);
      if (config.formData) {
        formData = { ...formData, ...config.formData };
      }
      await loadUploadedResumes();
      if (formData.resumeFileName && availableResumeFiles.includes(formData.resumeFileName)) {
        resumeFile = { name: formData.resumeFileName };
        resumeUploaded = true;
      } else if (availableResumeFiles.length > 0) {
        formData.resumeFileName = availableResumeFiles[0];
        resumeFile = { name: availableResumeFiles[0] };
        resumeUploaded = true;
      }
      console.log('Config loaded from project file');
    } catch (error) {
      console.log('No existing config found, using defaults');
      await loadUploadedResumes();
      if (availableResumeFiles.length > 0) {
        formData.resumeFileName = availableResumeFiles[0];
        resumeFile = { name: availableResumeFiles[0] };
        resumeUploaded = true;
      }
    }
  }

  async function saveConfig() {
    try {
      console.log('Saving config to project bots directory');
      
      // First create the directory if it doesn't exist
      await invoke<string>("create_directory_async", { 
        dirname: "src/bots" 
      }).catch(() => {}); // Ignore error if directory already exists
      
      let config;
      try {
        const configContent = await invoke<string>("read_file_async", { 
          filename: "src/bots/user-bots-config.json" 
        });
        config = JSON.parse(configContent);
      } catch {
        config = { formData: {}, industries: [], workRightOptions: [] };
      }

      config.formData = formData;
      
      await invoke<string>("write_file_async", { 
        filename: "src/bots/user-bots-config.json",
        content: JSON.stringify(config, null, 2)
      });
      console.log('Config saved to project file');
      return true;
    } catch (error) {
      console.error('Error saving config:', error);
      return false;
    }
  }

  async function validateUploadedResumeForCurrentUser(): Promise<{ success: boolean; message: string }> {
    const userEmail = (formData.email || '').trim();
    if (!userEmail) {
      return {
        success: false,
        message: 'Please add your Email in Profile & Contact before saving configuration.'
      };
    }

    try {
      const listRes = await fetch(`${CORPUS_RAG_API}/api/upload?userId=${encodeURIComponent(userEmail)}`);
      if (!listRes.ok) {
        return {
          success: false,
          message: `Could not verify uploads for ${userEmail} (status ${listRes.status}).`
        };
      }
      const listData = await listRes.json();
      const fileNames = (Array.isArray(listData?.files) ? listData.files : [])
        .map((f: any) => f?.name)
        .filter((name: unknown): name is string => typeof name === 'string' && isSupportedResumeFile(name));

      if (fileNames.length === 0) {
        return {
          success: false,
          message: `No uploaded .doc/.docx/.pdf resume found for ${userEmail}. Please upload resume first.`
        };
      }

      let selectedResumeName = '';
      if (formData.resumeFileName) {
        if (!fileNames.includes(formData.resumeFileName)) {
          return {
            success: false,
            message: `Selected resume "${formData.resumeFileName}" was not found in corpus uploads for ${userEmail}. Upload/select that same file first.`
          };
        }
        selectedResumeName = formData.resumeFileName;
      } else {
        selectedResumeName =
          fileNames.find((name: string) => name.toLowerCase().includes('resume')) ||
          fileNames[0];
      }

      const contentRes = await fetch(
        `${CORPUS_RAG_API}/api/upload?userId=${encodeURIComponent(userEmail)}&filename=${encodeURIComponent(selectedResumeName)}`
      );
      if (!contentRes.ok) {
        return {
          success: false,
          message: `Uploaded resume check failed for ${selectedResumeName} (status ${contentRes.status}).`
        };
      }
      const contentData = await contentRes.json();
      if (typeof contentData?.content !== 'string' || contentData.content.trim().length === 0) {
        return {
          success: false,
          message: `Uploaded resume ${selectedResumeName} is empty. Please upload a valid resume.`
        };
      }

      formData.resumeFileName = selectedResumeName;
      resumeFile = { name: selectedResumeName };
      resumeUploaded = true;
      return {
        success: true,
        message: `Resume verified: ${selectedResumeName}`
      };
    } catch (error) {
      return {
        success: false,
        message: `Resume upload validation failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async function syncSelectedResumeToCorpus(): Promise<{ success: boolean; message: string }> {
    const userEmail = (formData.email || '').trim();
    if (!userEmail) {
      return {
        success: false,
        message: 'Please add your Email in Profile & Contact before saving configuration.'
      };
    }

    const selectedResumeName = (formData.resumeFileName || '').trim();
    if (!selectedResumeName) {
      return {
        success: false,
        message: 'Please select/upload a resume file before saving configuration.'
      };
    }

    if (!isSupportedResumeFile(selectedResumeName)) {
      return {
        success: false,
        message: 'Only .doc, .docx, and .pdf resumes are supported.'
      };
    }

    try {
      const listRes = await fetch(`${CORPUS_RAG_API}/api/upload?userId=${encodeURIComponent(userEmail)}`);
      if (!listRes.ok) {
        return {
          success: false,
          message: `Could not verify uploads for ${userEmail} (status ${listRes.status}).`
        };
      }
      const listData = await listRes.json();
      const fileNames = (Array.isArray(listData?.files) ? listData.files : [])
        .map((f: any) => f?.name)
        .filter((name: unknown): name is string => typeof name === 'string' && isSupportedResumeFile(name));

      if (!fileNames.includes(selectedResumeName)) {
        return {
          success: false,
          message: `Selected resume "${selectedResumeName}" was not found in corpus uploads for ${userEmail}. Please upload it first.`
        };
      }

      return {
        success: true,
        message: `Resume synced in corpus: ${selectedResumeName}`
      };
    } catch (error) {
      return {
        success: false,
        message: `Resume sync to corpus failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
</script>

<div class="container mx-auto p-6">
  <div class="max-w-4xl mx-auto">
    <div class="flex justify-between items-center mb-8">
      <h1 class="text-4xl font-bold text-primary">⚙️ Configuration</h1>
      <button type="button" class="btn btn-outline" onclick={toggleAdvancedMode}>
        🔧 {isAdvancedMode ? 'Basic' : 'Advanced'}
      </button>
    </div>

    <form onsubmit={handleSubmit} class="space-y-8">
      <!-- Profile & Contact -->
      <div class="card bg-base-100 shadow-xl">
        <div class="card-body">
          <h2 class="card-title text-2xl mb-6">👤 Profile & Contact</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="form-control">
              <label class="label" for="full-name-input">
                <span class="label-text font-semibold">Full Name</span>
              </label>
              <input
                id="full-name-input"
                type="text"
                placeholder="Amit Chaulagain"
                bind:value={formData.fullName}
                class="input input-bordered w-full"
              />
            </div>

            <div class="form-control">
              <label class="label" for="email-input">
                <span class="label-text font-semibold">Email</span>
              </label>
              <input
                id="email-input"
                type="email"
                placeholder="you@example.com"
                bind:value={formData.email}
                class="input input-bordered w-full"
              />
            </div>

            <div class="form-control">
              <label class="label" for="phone-input">
                <span class="label-text font-semibold">Phone</span>
              </label>
              <input
                id="phone-input"
                type="text"
                placeholder="+61 4XX XXX XXX"
                bind:value={formData.phone}
                class="input input-bordered w-full"
              />
            </div>

            <div class="form-control">
              <label class="label" for="linkedin-url-input">
                <span class="label-text font-semibold">LinkedIn URL</span>
              </label>
              <input
                id="linkedin-url-input"
                type="url"
                placeholder="https://www.linkedin.com/in/your-profile"
                bind:value={formData.linkedinUrl}
                class="input input-bordered w-full"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Job Preferences -->
      <div class="card bg-base-100 shadow-xl">
        <div class="card-body">
          <h2 class="card-title text-2xl mb-6">🎯 Job Preferences</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="form-control">
              <label class="label" for="keywords-input">
                <span class="label-text font-semibold">Keywords (comma separated)</span>
                <span class="label-text-alt text-error">Required</span>
              </label>
              <input
                id="keywords-input"
                type="text"
                placeholder="python, backend, api, django"
                bind:value={formData.keywords}
                class="input input-bordered w-full"
                required
              />
            </div>

            <div class="form-control">
              <label class="label" for="locations-input">
                <span class="label-text font-semibold">Locations (comma separated)</span>
              </label>
              <input
                id="locations-input"
                type="text"
                placeholder="Sydney, Melbourne, Remote"
                bind:value={formData.locations}
                class="input input-bordered w-full"
              />
            </div>

            <div class="form-control">
              <label class="label" for="min-salary-input">
                <span class="label-text font-semibold">Minimum Salary (AUD)</span>
              </label>
              <input
                id="min-salary-input"
                type="number"
                placeholder="80000"
                min="0"
                bind:value={formData.minSalary}
                class="input input-bordered w-full"
              />
            </div>

            <div class="form-control">
              <label class="label" for="max-salary-input">
                <span class="label-text font-semibold">Maximum Salary (AUD)</span>
              </label>
              <input
                id="max-salary-input"
                type="number"
                placeholder="150000"
                min="0"
                bind:value={formData.maxSalary}
                class="input input-bordered w-full"
              />
            </div>

            <div class="form-control">
              <label class="label" for="job-type-select">
                <span class="label-text font-semibold">Job Types</span>
              </label>
              <select id="job-type-select" bind:value={formData.jobType} class="select select-bordered w-full">
                <option value="any">Any</option>
                <option value="full-time">Full time</option>
                <option value="part-time">Part time</option>
                <option value="contract">Contract/Temp</option>
                <option value="casual">Casual/Vacation</option>
              </select>
            </div>

            <div class="form-control">
              <label class="label" for="experience-level-select">
                <span class="label-text font-semibold">Experience Levels</span>
              </label>
              <select id="experience-level-select" bind:value={formData.experienceLevel} class="select select-bordered w-full">
                <option value="any">Any</option>
                <option value="entry">Entry Level</option>
                <option value="mid">Mid Level</option>
                <option value="senior">Senior</option>
                <option value="lead">Lead</option>
                <option value="executive">Executive</option>
              </select>
            </div>

            <div class="form-control">
              <label class="label" for="industry-select">
                <span class="label-text font-semibold">Industries</span>
              </label>
              <select id="industry-select" bind:value={formData.industry} class="select select-bordered w-full">
                {#each industries as industry}
                  <option value={industry.value} disabled={industry.value === ''}>{industry.label}</option>
                {/each}
              </select>
            </div>

            <div class="form-control">
              <label class="label" for="listed-date-select">
                <span class="label-text font-semibold">Job Listed On</span>
              </label>
              <select id="listed-date-select" bind:value={formData.listedDate} class="select select-bordered w-full">
                <option value="" disabled selected>Select listing date range</option>
                <option value="any">Any time</option>
                <option value="today">Today</option>
                <option value="last_3_days">Last 3 days</option>
                <option value="last_7_days">Last 7 days</option>
                <option value="last_14_days">Last 14 days</option>
                <option value="last_30_days">Last 30 days</option>
              </select>
            </div>

            <div class="form-control">
              <label class="label" for="remote-preference-select">
                <span class="label-text font-semibold">Remote Preference</span>
              </label>
              <select id="remote-preference-select" bind:value={formData.remotePreference} class="select select-bordered w-full">
                <option value="any">Any</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="on-site">On-site</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Work Rights -->
      <div class="form-section">
        <div class="section-header">🏛️ Work Rights</div>
        <div class="section-content">
          <div class="work-rights-group">
            <div class="work-rights-label">
              Which of the following statements best describes your right to work in Australia?
            </div>
            <div class="work-rights-select-wrapper">
              <select bind:value={formData.rightToWork} class="form-select work-rights-select" name="right_to_work_in_aus">
                {#each workRightOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Application Settings -->
      <div class="form-section">
        <div class="section-header">🤖 Application Settings</div>
        <div class="section-content">
          <div class="form-grid">
            <div class="form-group checkbox-group">
              <label class="checkbox-label">
                <span class="checkbox-text">Rewrite resume for each Job?</span>
                <input type="checkbox" bind:checked={formData.rewriteResume} class="checkbox-input" />
                <span class="checkmark"></span>
              </label>
            </div>

            <div class="form-group">
              <div class="form-label">
                <span class="label-text">Resume Upload</span>
                <span class="helper-text">PDF format recommended</span>
                <div class="text-sm opacity-80 mt-1">
                  Migration update: only `.doc`, `.docx`, and `.pdf` are supported. `.txt` is no longer allowed.
                </div>
                <div class="file-upload-wrapper">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    id="resume-upload"
                    class="file-input"
                    onchange={handleResumeUpload}
                  />
                  <label for="resume-upload" class="file-upload-label">
                    Choose File
                  </label>
                  {#if resumeUploaded}
                    <div class="file-upload-status">
                      <span class="upload-success">✓ Uploaded: {resumeFile?.name || 'filename.pdf'}</span>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Filters & Quality Control -->
      <div class="form-section">
        <div class="section-header">🎯 Quality Filters</div>
        <div class="section-content">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">
                <span class="label-text">Excluded Companies (comma separated)</span>
                <input
                  type="text"
                  placeholder="wipro, infosys, tcs"
                  bind:value={formData.excludedCompanies}
                  class="form-input"
                />
              </label>
            </div>

            <div class="form-group">
              <label class="form-label">
                <span class="label-text">Excluded Keywords</span>
                <input 
                  type="text" 
                  placeholder="junior, intern, php" 
                  bind:value={formData.excludedKeywords}
                  class="form-input"
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Smart Matching (Advanced) -->
      {#if isAdvancedMode}
        <div class="form-section collapsible">
          <div 
            class="section-header-collapsible" 
            role="button" 
            tabindex="0"
            onclick={toggleSmartMatching}
            onkeydown={(event) => handleToggleKeydown(event, toggleSmartMatching)}
          >
            <input type="checkbox" checked={showSmartMatching} readonly />
            <span class="section-title">🧠 Smart Matching Weights</span>
          </div>
          {#if showSmartMatching}
            <div class="section-content">
              <div class="form-grid">
                <div class="form-group">
                  <label class="form-label">
                    <span class="label-text">Skill Weight</span>
                    <span class="helper-text">0.0 - 1.0</span>
                    <input 
                      type="number" 
                      min="0" 
                      max="1" 
                      step="0.1" 
                      placeholder="0.4" 
                      bind:value={formData.skillWeight}
                      onblur={validateWeight}
                      class="form-input"
                    />
                  </label>
                </div>

                <div class="form-group">
                  <label class="form-label">
                    <span class="label-text">Location Weight</span>
                    <span class="helper-text">0.0 - 1.0</span>
                    <input 
                      type="number" 
                      min="0" 
                      max="1" 
                      step="0.1" 
                      placeholder="0.2" 
                      bind:value={formData.locationWeight}
                      onblur={validateWeight}
                      class="form-input"
                    />
                  </label>
                </div>

                <div class="form-group">
                  <label class="form-label">
                    <span class="label-text">Salary Weight</span>
                    <span class="helper-text">0.0 - 1.0</span>
                    <input 
                      type="number" 
                      min="0" 
                      max="1" 
                      step="0.1" 
                      placeholder="0.3" 
                      bind:value={formData.salaryWeight}
                      onblur={validateWeight}
                      class="form-input"
                    />
                  </label>
                </div>

                <div class="form-group">
                  <label class="form-label">
                    <span class="label-text">Company Weight</span>
                    <span class="helper-text">0.0 - 1.0</span>
                    <input 
                      type="number" 
                      min="0" 
                      max="1" 
                      step="0.1" 
                      placeholder="0.1" 
                      bind:value={formData.companyWeight}
                      onblur={validateWeight}
                      class="form-input"
                    />
                  </label>
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- DeepSeek API (Advanced) -->
        <div class="form-section collapsible">
          <div 
            class="section-header-collapsible" 
            role="button" 
            tabindex="0"
            onclick={toggleDeepSeek}
            onkeydown={(event) => handleToggleKeydown(event, toggleDeepSeek)}
          >
            <input type="checkbox" checked={showDeepSeek} readonly />
            <span class="section-title">🤖 DeepSeek AI Integration</span>
          </div>
          {#if showDeepSeek}
            <div class="section-content">
              <div class="form-grid">
                <div class="form-group checkbox-group">
                  <label class="checkbox-label">
                    <span class="checkbox-text">Enable DeepSeek</span>
                    <input type="checkbox" bind:checked={formData.enableDeepSeek} class="checkbox-input" />
                    <span class="checkmark"></span>
                  </label>
                </div>

                <div class="form-group">
                  <label class="form-label">
                    <span class="label-text">API Key</span>
                    <input 
                      type="password" 
                      placeholder="sk-..." 
                      bind:value={formData.deepSeekApiKey}
                      class="form-input"
                    />
                  </label>
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Legal Agreement -->
      <div class="form-section legal-section">
        <div class="legal-content">
          <h3 class="legal-title">Legal Disclaimer</h3>
          <div class="legal-text">
            Using this bot may violate Seek's Terms of Service. You assume all responsibility.
          </div>
        </div>

        <div class="legal-agreement">
          <label class="checkbox-label legal-checkbox">
            <span class="checkbox-text">I understand and accept</span>
            <input type="checkbox" bind:checked={formData.acceptTerms} required class="checkbox-input" />
            <span class="checkmark"></span>
          </label>
        </div>
      </div>

      <!-- Submit Button -->
      <div class="form-actions" style="display: flex; gap: var(--space-xl); justify-content: center; margin-top: var(--space-2xl); flex-wrap: wrap;">
        <button type="submit" class="btn btn--primary btn--large" disabled={isSubmitting}>
          {#if isSubmitting}
            Saving...
          {:else}
            💾 Save Configuration
          {/if}
        </button>
        <button type="button" class="btn btn--outline btn--large" onclick={resetForm}>
          🔄 Reset Form
        </button>
      </div>
      {#if uploadValidationMessage}
        <div style="margin-top: 12px; text-align: center; font-size: 0.9rem; opacity: 0.9;">
          {uploadValidationMessage}
        </div>
      {/if}
    </form>
  </div>
</div>

