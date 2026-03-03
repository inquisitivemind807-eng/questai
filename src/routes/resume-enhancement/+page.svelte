<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authService } from '$lib/authService.js';
  import { invoke } from '@tauri-apps/api/core';
  import { env } from '$env/dynamic/public';
  import '$styles/shared.css';
  import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
  import jsPDF from 'jspdf';

  let user: any = null;
  let jobs: any[] = [];
  let selectedJob: any = null;
  let jobContent: any = null;
  let jobDescription: string = '';
  let isLoading: boolean = false;
  let isGenerating: boolean = false;
  let enhancedResume: string | null = null;
  let originalResume: string = '';
  let enhancementFocus: string = 'general';
  let analysisResult: any = null;
  let fitScore: number = 0;
  let enhancedFitScore: number = 0;
  let comparisonView: 'unified' | 'sidebyside' = 'sidebyside';
  let enhancementPrompt: string = '';
  let defaultPrompt: string = '';
  let lastSavedPrompt: string = '';
  let isPromptExpanded: boolean = false;
  let isPromptModified: boolean = false;
  let configuredResumeName: string = '';
  let configuredResumeType: 'doc' | 'docx' | 'pdf' = 'docx';
  let configuredResumeStatus: string = '';
  let configuredResumePath: string = '';
  let configuredResumeCleanPath: string = '';
  let configuredResumeFileId: string = '';
  let currentUserId: string = '';
  let isLoadingResume: boolean = false;
  let resumeLoadSuccess: boolean = false;
  let lastEnhancedResumeFile: { id: string; filename: string; size: number } | null = null;
  let lastEnhancedResumeFilePath: string = '';
  let isEditingJob: boolean = false;
  let editedJobDescription: string = '';
  let editedJobData: any = null;
  let showJobForm: boolean = false;
  let newJob = { company: '', title: '', location: '', description: '' };
  let isSavingPrompt: boolean = false;
  let jwtToken: string = '';
  let isDownloading: boolean = false;
  let downloadSuccess: boolean = false;
  let downloadPath: string = '';
  let activeTab: 'original' | 'enhanced' | 'final' | 'compare' = 'original';
  let hideUnchanged: boolean = false;
  let originalAtsResult: Record<string, unknown> | null = null;
  let originalAtsLoading: boolean = false;
  let originalAtsError: string = '';
  let finalAtsResult: Record<string, unknown> | null = null;
  let finalAtsLoading: boolean = false;
  let finalAtsError: string = '';

  const CORPUS_RAG_API = env.PUBLIC_API_BASE || import.meta.env.VITE_API_BASE || 'http://localhost:3000';
  const ALLOWED_RESUME_EXTENSIONS = ['.doc', '.docx', '.pdf'];

  type ManagedResumeEntry = {
    id: string;
    filename: string;
  };

  function isSupportedResumeFile(name: string): boolean {
    const lower = String(name || '').toLowerCase();
    return ALLOWED_RESUME_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  onMount(() => {
    // Check authentication
    if (!$authService.isLoggedIn) {
      goto('/login');
      return;
    }

    user = $authService.user;
    getJwtToken();
    loadJobs();
    loadConfiguredResume();
    
    // Auto-refresh resume when page becomes visible (e.g., after switching tabs)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('Page visible, refreshing resume data...');
        loadConfiguredResume();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  });

  function toResumeType(name: string): 'doc' | 'docx' | 'pdf' {
    const lower = String(name || '').toLowerCase();
    if (lower.endsWith('.pdf')) return 'pdf';
    if (lower.endsWith('.docx')) return 'docx';
    return 'doc';
  }

  async function getManagedResumeEntries(userId: string): Promise<ManagedResumeEntry[]> {
    const rows = await invoke<any[]>('get_managed_files', {
      query: {
        userId,
        feature: 'resume'
      }
    });
    return Array.isArray(rows)
      ? rows.map((row: any) => ({
          id: String(row?.id || ''),
          filename: String(row?.filename || '')
        }))
      : [];
  }

  async function previewManagedResume(userId: string, fileId: string): Promise<string> {
    const text = await invoke<string>('preview_managed_file', {
      query: { userId, fileId, maxChars: 1_000_000 }
    });
    return String(text || '');
  }

  async function registerManagedBinaryEnhancement(input: {
    userId: string;
    filename: string;
    contentBase64: string;
    jobId?: string;
    mimeType: string;
    tags: string[];
  }): Promise<any> {
    return await invoke('register_managed_file_base64', {
      input: {
        userId: input.userId,
        feature: 'enhancement',
        filename: input.filename,
        contentBase64: input.contentBase64,
        jobId: input.jobId,
        sourceRoute: '/resume-enhancement',
        mimeType: input.mimeType,
        tags: input.tags
      }
    });
  }


  async function downloadUpdatedResume(fileId: string) {
    try {
      isDownloading = true;
      downloadSuccess = false;
      downloadPath = '';
      
      const userId = user?.email || '';
      if (!userId || !fileId) return;
      
      const result = await invoke<string>('save_managed_file_to_downloads', {
        input: { userId, fileId }
      });
      
      downloadPath = result.replace('Saved to:\n', '');
      downloadSuccess = true;
    } catch (error: any) {
      console.error('Failed to save enhanced resume to Downloads:', error);
      const message = error instanceof Error ? error.message : String(error);
      alert(`❌ Failed to save to Downloads:\n${message}`);
    } finally {
      isDownloading = false;
    }
  }

  async function getJwtToken() {
    try {
      // Preferred path: use auth service access token directly.
      const directAccessToken = await authService.getAccessToken();
      if (directAccessToken) {
        jwtToken = directAccessToken;
        return;
      }

      // Legacy fallback: convert older session tokens if present.
      const sessionToken = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
      if (!sessionToken) return;

      const res = await fetch(`${CORPUS_RAG_API}/api/auth/session-to-jwt`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.accessToken) {
          jwtToken = data.accessToken;
        }
      } else {
        // Keep visible for debugging, but do not fail hard here.
        console.warn('session-to-jwt failed with status:', res.status);
      }
    } catch (err) {
      console.error('Failed to get JWT token:', err);
    }
  }

  async function loadConfiguredResume() {
    isLoadingResume = true;
    try {
      const userId = user?.email || '';
      currentUserId = userId;
      if (!userId) {
        configuredResumeName = '';
        configuredResumeStatus = 'No logged-in user found.';
        configuredResumePath = '';
        configuredResumeCleanPath = '';
        configuredResumeFileId = '';
        originalResume = '';
        return;
      }

      let preferredResumeFileName = '';
      try {
        const configContent = await invoke<string>('read_file_async', {
          filename: 'src/bots/user-bots-config.json'
        });
        const parsed = JSON.parse(configContent);
        preferredResumeFileName = String(parsed?.formData?.resumeFileName || '').trim();
      } catch {
        // Continue with managed-files fallback when config file cannot be read.
      }

      const entries = await getManagedResumeEntries(userId);
      const resumes = entries.filter((entry: any) => isSupportedResumeFile(entry.filename));
      if (resumes.length === 0) {
        configuredResumeName = '';
        configuredResumeStatus = 'No resume found in canonical storage. Upload one from Configuration page.';
        configuredResumePath = '';
        configuredResumeCleanPath = '';
        configuredResumeFileId = '';
        originalResume = '';
        return;
      }

      let selected = preferredResumeFileName
        ? resumes.find((entry: any) => entry.filename === preferredResumeFileName)
        : undefined;

      if (!selected) {
        selected =
          resumes.find((entry: any) => entry.filename.toLowerCase().includes('resume')) ||
          resumes[0];
      }

      configuredResumeName = selected.filename;
      configuredResumeType = toResumeType(selected.filename);

      // Load preview directly from the resume file (PDF, DOC, DOCX only)
      try {
        originalResume = await previewManagedResume(userId, selected.id);

        // If it's a binary file message, make it more user-friendly
        if (originalResume.startsWith('[Binary file:')) {
          originalResume = `📄 ${selected.filename}\n\nThis is a ${selected.filename.split('.').pop()?.toUpperCase() || 'document'} file. Click the location link above to open and view the full content.`;
        }
      } catch (previewError) {
        console.warn('Failed to load resume preview:', previewError);
        originalResume = `📄 ${selected.filename}\n\nPreview not available. Click the location link above to open and view the file content.`;
      }
      
      // Get full file path
      try {
        const fullPath = await invoke<string>('get_managed_file_path', {
          input: { userId, fileId: selected.id }
        });
        configuredResumePath = fullPath;
        configuredResumeFileId = selected.id;

        // Show clean path since working files are now in resumes/ folder
        const pathParts = fullPath.split('/');
        const userDir = pathParts.slice(0, -2).join('/'); // Remove storage/resume parts
        configuredResumeCleanPath = `${userDir}/resumes/${selected.filename}`;
      } catch (pathError) {
        console.warn('Could not get file path:', pathError);
        configuredResumePath = '';
        configuredResumeCleanPath = '';
        configuredResumeFileId = '';
      }
      
      configuredResumeStatus = `Using configured resume: ${configuredResumeName}`;
      resumeLoadSuccess = true;
    } catch (error: any) {
      console.error('Failed to load configured resume:', error);
      configuredResumeName = '';
      configuredResumeStatus = `Failed to load configured resume: ${error?.message || error}`;
      configuredResumePath = '';
      configuredResumeCleanPath = '';
      configuredResumeFileId = '';
      originalResume = '';
      resumeLoadSuccess = false;
    } finally {
      isLoadingResume = false;
    }
  }


  async function openFilePathHandler(filePath: string) {
    try {
      const result = await invoke<string>('open_file_path', { path: filePath });
      console.log(result);
    } catch (error) {
      console.error('Failed to open file:', error);
      alert('Failed to open file: ' + error);
    }
  }

  async function openManagedFileHandler(userId: string, fileId: string) {
    try {
      const result = await invoke('open_managed_file', {
        input: { userId, fileId }
      });
      console.log(result);
    } catch (error) {
      console.error('Failed to open managed file:', error);
      alert('Failed to open managed file: ' + error);
    }
  }

  function toggleJobForm() {
    showJobForm = !showJobForm;
    if (showJobForm) {
      newJob = { company: '', title: '', location: '', description: '' };
    }
  }

  async function saveNewJob() {
    if (!newJob.company || !newJob.title || !newJob.description) {
      alert('Please fill in company, title, and description');
      return;
    }

    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newJob)
      });

      const data = await response.json();

      if (data.success) {
        alert('✅ Job saved successfully');
        showJobForm = false;
        newJob = { company: '', title: '', location: '', description: '' };
        await loadJobs();
      } else {
        alert('❌ Failed to save job: ' + data.error);
      }
    } catch (error: any) {
      console.error('Failed to save job:', error);
      alert('❌ Failed to save job: ' + error.message);
    }
  }


  async function loadJobs() {
    if (!user) return;

    isLoading = true;
    try {
      // Load jobs from corpus-rag API
      const response = await fetch(`/api/jobs`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        // Filter to only jobs with descriptions
        jobs = (data.data?.jobs || data.jobs || []).filter((job: any) => job.hasJobDetails).map((job: any) => ({
          filename: job.filename,
          company: job.company || 'Unknown',
          title: job.title || 'No title',
          location: job.location || '',
          jobId: job.jobId || job.job_id || '',
          hasJobDetails: true,
          size: job.size || 0
        }));
      } else {
        console.error('Failed to load jobs:', data.error);
        alert('Failed to load jobs: ' + (data.error || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Failed to load jobs:', error);
      alert('Failed to load jobs: ' + error.message);
    } finally {
      isLoading = false;
    }
  }

  async function selectJob(job: any) {
    selectedJob = job;
    jobContent = null;
    jobDescription = '';
    isEditingJob = false;
    originalAtsResult = null;
    originalAtsError = '';
    finalAtsResult = null;
    finalAtsError = '';
    enhancedResume = null;
    analysisResult = null;
    activeTab = 'original';

    try {
      // Load job details from corpus-rag API
      const response = await fetch(`/api/jobs/${encodeURIComponent(job.filename)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        const content = data.data?.content || data.content || data.data;
        jobContent = content;

        let description = '';
        if (content.description) {
          description = content.description;
        } else if (content.details) {
          description = content.details;
        } else {
          description = JSON.stringify(content, null, 2);
        }

        jobDescription = description;
        editedJobDescription = description;
      } else {
        throw new Error(data.error || 'Failed to load job details');
      }
    } catch (error: any) {
      console.error('Failed to load job details:', error);
      alert('Failed to load job details: ' + error.message);
    }
  }

  function startEditingJob() {
    isEditingJob = true;
    editedJobDescription = jobDescription;
    // Create a deep copy of jobContent for editing
    if (jobContent) {
      editedJobData = JSON.parse(JSON.stringify(jobContent));
    }
  }

  function cancelEditingJob() {
    isEditingJob = false;
    editedJobDescription = jobDescription;
    editedJobData = null;
  }

  function saveEditedJob() {
    if (editedJobData) {
      // Update jobContent with edited data
      jobContent = JSON.parse(JSON.stringify(editedJobData));
      // Update jobDescription from the edited data
      if (editedJobData.details) {
        jobDescription = editedJobData.details;
      } else if (editedJobData.description) {
        jobDescription = editedJobData.description;
      } else {
        jobDescription = JSON.stringify(editedJobData, null, 2);
      }
    }
    isEditingJob = false;
    editedJobData = null;
    alert('✅ Job description updated for this session');
  }
  
  // Helper function to check if a value is a nested object
  function isNestedObject(value: any): boolean {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
  
  // Helper function to get display label for field names
  function getFieldLabel(key: string): string {
    return key
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  // Helper function to check if a field should be readonly
  function formatAtsLabel(key: string): string {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function atsArray(arr: unknown): string[] {
    return Array.isArray(arr) ? arr.map((x) => String(x ?? '')) : [];
  }

  function atsRecommendationsBullets(arr: unknown): string[] {
    return atsArray(arr).flatMap((r) =>
      String(r)
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }

  function scoreClass(score: unknown): 'high' | 'medium' | 'low' | 'none' {
    const n = typeof score === 'number' ? score : parseInt(String(score ?? ''), 10);
    if (Number.isNaN(n)) return 'none';
    if (n >= 80) return 'high';
    if (n >= 60) return 'medium';
    return 'low';
  }

  function isReadonlyField(key: string): boolean {
    const readonlyFields = [
      'jobId', 'jobid', 'job_id',
      'createdAt', 'createdat', 'created_at',
      'lastModified', 'lastmodified', 'last_modified', 'updatedAt', 'updatedat', 'updated_at',
      'size',
      'scrapedAt', 'scrapedat', 'scraped_at'
    ];
    return readonlyFields.includes(key.toLowerCase()) || key.toLowerCase().startsWith('custom_');
  }

  async function fetchOriginalAts() {
    if (!originalResume?.trim() || !jobDescription?.trim()) return;
    if (!jwtToken) await getJwtToken();
    if (!jwtToken) {
      originalAtsError = 'Authentication required. Please refresh the page or log in again.';
      return;
    }
    originalAtsLoading = true;
    originalAtsError = '';
    try {
      const res = await fetch('/api/resume/ats-score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          resume_text: originalResume,
          job_desc: jobDescription
        })
      });
      const data = await res.json();
      if (data.success && data.data) {
        originalAtsResult = data.data;
      } else {
        originalAtsError = res.status === 401
          ? 'Session expired. Please refresh the page and try again.'
          : (data.error || 'Failed to fetch original fit score');
      }
    } catch (err: any) {
      originalAtsError = err?.message || 'Request failed';
    } finally {
      originalAtsLoading = false;
    }
  }

  async function fetchFinalAts() {
    if (!enhancedResume?.trim() || !jobDescription?.trim()) return;
    if (!jwtToken) await getJwtToken();
    if (!jwtToken) {
      finalAtsError = 'Authentication required. Please refresh the page or log in again.';
      return;
    }
    finalAtsLoading = true;
    finalAtsError = '';
    try {
      const res = await fetch('/api/resume/ats-score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          resume_text: enhancedResume,
          job_desc: jobDescription
        })
      });
      const data = await res.json();
      if (data.success && data.data) {
        finalAtsResult = data.data;
      } else {
        finalAtsError = res.status === 401
          ? 'Session expired. Please refresh the page and try again.'
          : (data.error || 'Failed to fetch final fit score');
      }
    } catch (err: any) {
      finalAtsError = err?.message || 'Request failed';
    } finally {
      finalAtsLoading = false;
    }
  }

  async function enhanceResume() {
    if (!jobDescription.trim()) {
      alert('Please select a job or enter a job description');
      return;
    }

    if (!originalResume.trim()) {
      alert('Please configure and upload a valid resume in Configuration page first.');
      return;
    }

    isGenerating = true;
    enhancedResume = null;
    analysisResult = null;

    try {
      // Ensure we have JWT token
      if (!jwtToken) {
        await getJwtToken();
        if (!jwtToken) {
          alert('Please login first');
          goto('/login');
          return;
        }
      }

      console.log('=== ENHANCEMENT REQUEST ===');
      console.log('✓ Job description:', jobDescription.length, 'characters');
      console.log('✓ Enhancement focus:', enhancementFocus);
      console.log('✓ User email:', user.email);
      console.log('✓ Resume length:', originalResume.length, 'characters');
      console.log('========================');

      const response = await fetch('/api/resume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          userId: user.email,
          jobDescription: jobDescription,
          enhancementFocus: enhancementFocus,
          resumeText: originalResume
        })
      });

      console.log('API response status:', response.status);

      const data = await response.json();

      if (data.success) {
        enhancedResume = data.enhancedResume;
        fitScore = data.originalFitScore || 0;
        enhancedFitScore = data.enhancedFitScore || 0;
        activeTab = 'enhanced';

        await analyzeEnhancement();
        const savedFile = await saveEnhancedResumeToLocalFiles(false);
        if (savedFile) {
          lastEnhancedResumeFile = savedFile;
          // Get the file path for the enhanced resume
          try {
            const fullPath = await invoke<string>('get_managed_file_path', {
              input: { userId: currentUserId, fileId: savedFile.id }
            });
            // Show the actual path where the enhanced resume is stored
            lastEnhancedResumeFilePath = fullPath;
          } catch (error) {
            console.warn('Could not get enhanced resume file path:', error);
            lastEnhancedResumeFilePath = '';
          }
        } else {
          console.warn('Enhanced resume generated but auto-save failed.');
        }
      } else {
        alert('Failed to enhance resume: ' + data.error);
      }
    } catch (error: any) {
      console.error('Failed to enhance resume:', error);
      alert('Failed to enhance resume: ' + error.message);
    } finally {
      isGenerating = false;
    }
  }

  async function analyzeEnhancement() {
    if (!enhancedResume) return;

    // Fit scores come from API; set minimal analysis for Tab 2 display
    analysisResult = {
      totalLines: enhancedResume.split(/\r?\n/).length,
      linesAdded: 0,
      linesRemoved: 0,
      fitScoreImprovement: Math.max(0, (enhancedFitScore || 0) - (fitScore || 0))
    };
  }

  function generateDiff() {
    if (!originalResume || !enhancedResume) return [];

    // Normalize lines: split on CRLF/ LF and trim trailing spaces
    const lines1 = originalResume.split(/\r?\n/).map((l) => l.replace(/\s+$/u, ''));
    const lines2 = enhancedResume.split(/\r?\n/).map((l) => l.replace(/\s+$/u, ''));

    type DiffRow = {
      type: 'unchanged' | 'added' | 'removed' | 'modified';
      original: string;
      enhanced: string;
      originalTokens?: { text: string; kind: 'unchanged' | 'removed' }[];
      enhancedTokens?: { text: string; kind: 'unchanged' | 'added' }[];
    };

    const m = lines1.length;
    const n = lines2.length;

    // Build LCS length table
    const lcs: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (lines1[i - 1] === lines2[j - 1]) {
          lcs[i][j] = lcs[i - 1][j - 1] + 1;
        } else {
          lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
        }
      }
    }

    type Op =
      | { kind: 'unchanged'; line1: string; line2: string }
      | { kind: 'added'; line: string }
      | { kind: 'removed'; line: string };

    const ops: Op[] = [];
    let i = m;
    let j = n;

    // Backtrack LCS table to produce basic ops (unchanged/added/removed)
    while (i > 0 && j > 0) {
      if (lines1[i - 1] === lines2[j - 1]) {
        ops.push({ kind: 'unchanged', line1: lines1[i - 1], line2: lines2[j - 1] });
        i--;
        j--;
      } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
        ops.push({ kind: 'removed', line: lines1[i - 1] });
        i--;
      } else {
        ops.push({ kind: 'added', line: lines2[j - 1] });
        j--;
      }
    }
    while (i > 0) {
      ops.push({ kind: 'removed', line: lines1[i - 1] });
      i--;
    }
    while (j > 0) {
      ops.push({ kind: 'added', line: lines2[j - 1] });
      j--;
    }

    ops.reverse();

    // Optional word-level diff for modified lines
    function buildTokenDiff(
      originalLine: string,
      enhancedLine: string
    ): {
      originalTokens: { text: string; kind: 'unchanged' | 'removed' }[];
      enhancedTokens: { text: string; kind: 'unchanged' | 'added' }[];
    } {
      const aWords = originalLine.split(/\s+/u).filter((w) => w.length > 0);
      const bWords = enhancedLine.split(/\s+/u).filter((w) => w.length > 0);
      const aLen = aWords.length;
      const bLen = bWords.length;
      const dp: number[][] = Array.from({ length: aLen + 1 }, () => Array(bLen + 1).fill(0));

      for (let ai = 1; ai <= aLen; ai++) {
        for (let bj = 1; bj <= bLen; bj++) {
          if (aWords[ai - 1] === bWords[bj - 1]) {
            dp[ai][bj] = dp[ai - 1][bj - 1] + 1;
          } else {
            dp[ai][bj] = Math.max(dp[ai - 1][bj], dp[ai][bj - 1]);
          }
        }
      }

      const originalTokens: { text: string; kind: 'unchanged' | 'removed' }[] = [];
      const enhancedTokens: { text: string; kind: 'unchanged' | 'added' }[] = [];

      let ai = aLen;
      let bj = bLen;
      const wordOps: Array<{ kind: 'unchanged' | 'added' | 'removed'; word: string }> = [];

      while (ai > 0 && bj > 0) {
        if (aWords[ai - 1] === bWords[bj - 1]) {
          wordOps.push({ kind: 'unchanged', word: aWords[ai - 1] });
          ai--;
          bj--;
        } else if (dp[ai - 1][bj] >= dp[ai][bj - 1]) {
          wordOps.push({ kind: 'removed', word: aWords[ai - 1] });
          ai--;
        } else {
          wordOps.push({ kind: 'added', word: bWords[bj - 1] });
          bj--;
        }
      }
      while (ai > 0) {
        wordOps.push({ kind: 'removed', word: aWords[ai - 1] });
        ai--;
      }
      while (bj > 0) {
        wordOps.push({ kind: 'added', word: bWords[bj - 1] });
        bj--;
      }

      wordOps.reverse();

      for (const op of wordOps) {
        if (op.kind === 'unchanged') {
          originalTokens.push({ text: op.word, kind: 'unchanged' });
          enhancedTokens.push({ text: op.word, kind: 'unchanged' });
        } else if (op.kind === 'removed') {
          originalTokens.push({ text: op.word, kind: 'removed' });
        } else if (op.kind === 'added') {
          enhancedTokens.push({ text: op.word, kind: 'added' });
        }
      }

      return { originalTokens, enhancedTokens };
    }

    const diffRows: DiffRow[] = [];

    // Coalesce removed+added into modified where appropriate
    for (let k = 0; k < ops.length; k++) {
      const current = ops[k];
      const next = ops[k + 1];

      if (
        current &&
        next &&
        current.kind === 'removed' &&
        next.kind === 'added'
      ) {
        const original = current.line;
        const enhanced = next.line;
        const tokens = buildTokenDiff(original, enhanced);
        diffRows.push({
          type: 'modified',
          original,
          enhanced,
          originalTokens: tokens.originalTokens,
          enhancedTokens: tokens.enhancedTokens
        });
        k++; // skip next
      } else if (current.kind === 'unchanged') {
        diffRows.push({
          type: 'unchanged',
          original: current.line1,
          enhanced: current.line2
        });
      } else if (current.kind === 'removed') {
        diffRows.push({
          type: 'removed',
          original: current.line,
          enhanced: ''
        });
      } else if (current.kind === 'added') {
        diffRows.push({
          type: 'added',
          original: '',
          enhanced: current.line
        });
      }
    }

    return diffRows;
  }

  function formatFileSize(bytes: number) {
    if (bytes === 0) return '0 KB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i)) + ' ' + sizes[i];
  }

  function formatDateTime(dateText: string) {
    const d = new Date(dateText);
    if (Number.isNaN(d.getTime())) return dateText || '-';
    return d.toLocaleString();
  }

  function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  async function buildEnhancedResumeDocxBlob(text: string): Promise<Blob> {
    const lines = text.split('\n').filter((line: string) => line.trim());
    const paragraphs = lines.map((line: string) => {
      const isHeading = line.length < 50 && (
        line === line.toUpperCase() ||
        /^(SUMMARY|EXPERIENCE|EDUCATION|SKILLS|PROJECTS|CERTIFICATIONS)/i.test(line)
      );
      if (isHeading) {
        return new Paragraph({
          text: line,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 120 }
        });
      }
      return new Paragraph({
        children: [new TextRun(line)],
        spacing: { after: 120 }
      });
    });

    const doc = new Document({
      sections: [{
        properties: {},
        children: paragraphs
      }]
    });
    return Packer.toBlob(doc);
  }

  function buildEnhancedResumePdfArrayBuffer(text: string): ArrayBuffer {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const maxWidth = pageWidth - (margin * 2);
    let yPosition = margin;
    const lineHeight = 7;

    const lines = text.split('\n');
    lines.forEach((line: string) => {
      if (!line.trim()) {
        yPosition += lineHeight / 2;
        return;
      }

      const isHeading = line.length < 50 && (
        line === line.toUpperCase() ||
        /^(SUMMARY|EXPERIENCE|EDUCATION|SKILLS|PROJECTS|CERTIFICATIONS)/i.test(line)
      );

      if (isHeading) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
      } else {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
      }

      const splitLines = doc.splitTextToSize(line, maxWidth);
      splitLines.forEach((splitLine: string) => {
        if (yPosition > pageHeight - margin) {
          doc.addPage();
          yPosition = margin;
        }
        doc.text(splitLine, margin, yPosition);
        yPosition += lineHeight;
      });

      if (isHeading) {
        yPosition += lineHeight / 2;
      }
    });

    return doc.output('arraybuffer');
  }

  async function saveEnhancedResumeToLocalFiles(showAlert = true) {
    if (!enhancedResume?.trim() || !user?.email) return false;
    const company = (selectedJob?.company || 'company').replace(/[^a-zA-Z0-9._-]/g, '_');
    try {
      const selectedType = configuredResumeType === 'pdf' ? 'pdf' : 'docx';
      const extension = selectedType === 'pdf' ? 'pdf' : 'docx';
      const filename = `enhanced-resume-${company}-${Date.now()}.${extension}`;

      let base64Payload = '';
      let mimeType = '';
      if (selectedType === 'pdf') {
        const pdfBuffer = buildEnhancedResumePdfArrayBuffer(enhancedResume);
        base64Payload = arrayBufferToBase64(pdfBuffer);
        mimeType = 'application/pdf';
      } else {
        const docxBlob = await buildEnhancedResumeDocxBlob(enhancedResume);
        const docxBuffer = await docxBlob.arrayBuffer();
        base64Payload = arrayBufferToBase64(docxBuffer);
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }

      const managedFileEntry = await registerManagedBinaryEnhancement({
        userId: user.email,
        filename,
        contentBase64: base64Payload,
        jobId: selectedJob?.jobId || selectedJob?.filename,
        mimeType,
        tags: ['generated', 'resume-enhancement', selectedType]
      });
      if (showAlert) {
        alert('Saved to local Files Manager');
      }

      const fileSize = Math.ceil(base64Payload.length * 0.75);
      return {
        id: managedFileEntry.id,
        filename: managedFileEntry.filename,
        size: fileSize
      };
    } catch (error: any) {
      console.error('Failed saving enhanced resume locally:', error);
      if (showAlert) {
        alert(`Failed to save locally: ${error?.message || error}`);
      }
      return false;
    }
  }
</script>

<main class="container mx-auto max-w-7xl p-6">
  <div class="mb-8">
    <h1 class="text-4xl font-bold mb-4 text-primary">✨ Resume Enhancement</h1>
    <p class="text-base-content/70">Tailor your resume to match specific job requirements using AI</p>
  </div>

  <div class="main-content">
    <!-- Configured Resume -->
    <div class="resume-selector-section">
      {#if isLoadingResume}
        <div style="padding: 14px; background: rgba(102, 126, 234, 0.05); border: 1px solid rgba(102, 126, 234, 0.2); border-radius: 8px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="spinner"></div>
            <span>Loading configured resume...</span>
          </div>
          <div style="margin-top: 12px;">
            <div style="width: 100%; height: 6px; background: rgba(0,0,0,0.1); border-radius: 3px; overflow: hidden;">
              <div class="progress-bar"></div>
            </div>
          </div>
        </div>
      {:else if configuredResumePath}
        <div style="padding: 14px; background: rgba(102, 126, 234, 0.1); border: 2px solid rgba(102, 126, 234, 0.4); border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="font-weight: 700; font-size: 1.05rem; color: #667eea;">
              📄 Using Resume
            </div>
            <button 
              onclick={loadConfiguredResume}
              disabled={isLoadingResume}
              style="padding: 4px 12px; background: rgba(102, 126, 234, 0.2); border: 1px solid rgba(102, 126, 234, 0.4); border-radius: 4px; color: #667eea; cursor: pointer; font-size: 0.85rem; font-weight: 600;"
              title="Refresh resume data"
            >
              🔄 Refresh
            </button>
          </div>
          <div style="font-size: 0.95rem; margin-bottom: 6px;">
            <strong>File:</strong> {configuredResumeName}
          </div>
          <div style="font-size: 0.85rem; word-break: break-all; margin-bottom: 6px; opacity: 0.9;">
            <strong>Location:</strong>
            <button
              onclick={() => openManagedFileHandler(currentUserId, configuredResumeFileId)}
              style="background: none; border: none; color: #667eea; text-decoration: underline; cursor: pointer; padding: 0; font-size: inherit; text-align: left; word-break: break-all;"
              title="Click to open file"
            >
              {configuredResumeCleanPath}
            </button>
          </div>
          {#if originalResume}
            <div style="font-size: 0.85rem; opacity: 0.8;">
              {originalResume.split('\n').length} lines · {originalResume.length} characters
            </div>
          {/if}
        </div>
      {:else if configuredResumeStatus}
        <div class="indicator-text" style="font-size: 0.85rem;">{configuredResumeStatus}</div>
      {/if}

      {#if lastEnhancedResumeFile}
        <div style="margin-top: 12px;">
          <div class="selector-label">
            <span class="label-icon">✅</span>
            <span class="label-text">Last Enhanced Resume</span>
          </div>
          <div class="jobs-list" style="margin-top: 8px;">
            <div class="job-item" style="cursor: default;">
              <div>
                <h3 class="job-company">{lastEnhancedResumeFile.filename}</h3>
                <p class="job-title">{formatFileSize(lastEnhancedResumeFile.size)}</p>
                {#if lastEnhancedResumeFilePath}
                  <div style="font-size: 0.85rem; word-break: break-all; margin-top: 6px; opacity: 0.9;">
                    <strong>Location:</strong>
                    <button
                      onclick={() => openManagedFileHandler(currentUserId, lastEnhancedResumeFile?.id || '')}
                      style="background: none; border: none; color: #667eea; text-decoration: underline; cursor: pointer; padding: 0; font-size: inherit; text-align: left; word-break: break-all; margin-left: 4px;"
                      title="Click to open file"
                    >
                      {lastEnhancedResumeFilePath}
                    </button>
                  </div>
                {/if}
              </div>
              <div class="header-buttons">
                <button 
                  class="download-btn" 
                  onclick={() => downloadUpdatedResume(lastEnhancedResumeFile?.id || '')}
                  disabled={isDownloading}
                >
                  {#if isDownloading}
                    ⏳ Downloading...
                  {:else}
                    ⬇️ Download Updated Resume
                  {/if}
                </button>
              </div>
            </div>
          </div>
          
          {#if isDownloading}
            <div style="margin-top: 12px;">
              <div style="width: 100%; height: 6px; background: rgba(0,0,0,0.1); border-radius: 3px; overflow: hidden;">
                <div class="progress-bar"></div>
              </div>
            </div>
          {/if}
          
          {#if downloadSuccess && downloadPath}
            <div style="margin-top: 12px; padding: 12px; background: rgba(40, 167, 69, 0.2); border: 1px solid rgba(40, 167, 69, 0.4); border-radius: 6px;">
              <div style="font-weight: 600; color: #28a745; margin-bottom: 4px;">
                ✅ Downloaded Successfully!
              </div>
              <div style="font-size: 0.9rem; word-break: break-all;">
                <strong>Location:</strong> 
                <button 
                  onclick={() => openFilePathHandler(downloadPath)}
                  style="background: none; border: none; color: #28a745; text-decoration: underline; cursor: pointer; padding: 0; font-size: inherit; text-align: left; word-break: break-all;"
                  title="Click to open file"
                >
                  {downloadPath}
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Jobs List - Horizontal -->
    <div class="jobs-sidebar">
      <div class="sidebar-header">
        <h2>💼 Available Jobs</h2>
        <div class="header-buttons">
          <button class="add-job-btn" onclick={toggleJobForm}>
            {#if showJobForm}✖️ Cancel{:else}➕ New Job{/if}
          </button>
          <button class="refresh-btn" onclick={loadJobs} disabled={isLoading}>
            {#if isLoading}⏳{:else}🔄{/if}
          </button>
        </div>
      </div>

      <!-- New Job Form -->
      {#if showJobForm}
        <div class="job-form">
          <h3 class="form-title">Add New Job</h3>
          <div class="form-group">
            <label for="company">Company Name *</label>
            <input type="text" id="company" bind:value={newJob.company} placeholder="e.g., Google" />
          </div>
          <div class="form-group">
            <label for="title">Job Title *</label>
            <input type="text" id="title" bind:value={newJob.title} placeholder="e.g., Senior Software Engineer" />
          </div>
          <div class="form-group">
            <label for="location">Location</label>
            <input type="text" id="location" bind:value={newJob.location} placeholder="e.g., Remote, USA" />
          </div>
          <div class="form-group">
            <label for="description">Job Description *</label>
            <textarea
              id="description"
              bind:value={newJob.description}
              placeholder="Paste the full job description here..."
              rows="10"
            ></textarea>
          </div>
          <button class="save-job-btn" onclick={saveNewJob}>
            💾 Save Job
          </button>
        </div>
      {/if}

      {#if isLoading}
        <div class="loading">Loading jobs...</div>
      {:else if jobs.length === 0}
        <div class="empty-state">
          <p>No job descriptions found</p>
        </div>
      {:else}
        <div class="jobs-list">
          {#each jobs as job}
            <div
              class="job-item"
              class:selected={selectedJob?.filename === job.filename}
              onclick={() => selectJob(job)}
              onkeydown={(e) => e.key === 'Enter' && selectJob(job)}
              role="button"
              tabindex="0"
            >
              <div class="job-header">
                <span class="job-type">💼</span>
                <div class="job-header-right">
                  <span class="job-size">{formatFileSize(job.size)}</span>
                </div>
              </div>
              <div>
                <h3 class="job-company">{job.company}</h3>
                <p class="job-title">{job.title}</p>
                {#if job.location}
                  <p class="job-location">📍 {job.location}</p>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Main Panel -->
    <div class="cover-letter-panel">
      {#if !selectedJob}
        <div class="no-selection">
          <div class="placeholder-icon">✨</div>
          <h2>Select a job to enhance your resume</h2>
          <p>Choose from the job descriptions above to start tailoring your resume</p>
        </div>
      {:else}
        <div class="job-header-section">
          <div class="job-info">
            <h2>{selectedJob.company}</h2>
            <h3>{selectedJob.title}</h3>
            {#if selectedJob.location}
              <p class="location">📍 {selectedJob.location}</p>
            {/if}
          </div>

          <div class="generate-section">
            <button
              class="calculate-fit-btn"
              onclick={() => { activeTab = 'original'; fetchOriginalAts(); }}
              disabled={originalAtsLoading || !jobContent || !originalResume}
              title="Calculate original resume fit score"
            >
              {#if originalAtsLoading}
                ⏳ Calculating...
              {:else}
                📊 Calculate Fit Score
              {/if}
            </button>
            <button
              class="generate-btn"
              onclick={enhanceResume}
              disabled={isGenerating || !jobContent || !originalResume}
              style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);"
            >
              {#if isGenerating}
                ⏳ Enhancing...
              {:else}
                ✨ Enhance Resume
              {/if}
            </button>
          </div>
        </div>

        <!-- Tabs -->
        <div class="resume-tabs">
          <button
            class="resume-tab"
            class:active={activeTab === 'original'}
            onclick={() => { activeTab = 'original'; if (!originalAtsResult && !originalAtsLoading && originalResume && jobDescription) fetchOriginalAts(); }}
          >
            1. Original Fit Score
          </button>
          <button
            class="resume-tab"
            class:active={activeTab === 'enhanced'}
            onclick={() => activeTab = 'enhanced'}
          >
            2. Enhanced Resume
          </button>
          <button
            class="resume-tab"
            class:active={activeTab === 'final'}
            class:disabled={!enhancedResume}
            onclick={() => { activeTab = 'final'; if (enhancedResume && !finalAtsResult && !finalAtsLoading) fetchFinalAts(); }}
            title={!enhancedResume ? 'Run enhancement first' : ''}
          >
            3. Final Fit Score
          </button>
          <button
            class="resume-tab"
            class:active={activeTab === 'compare'}
            class:disabled={!enhancedResume}
            onclick={() => { activeTab = 'compare'; if (enhancedResume && !finalAtsResult && !finalAtsLoading) fetchFinalAts(); }}
            title={!enhancedResume ? 'Run enhancement first' : ''}
          >
            4. Compare
          </button>
        </div>

        <!-- Job Description Preview -->
        {#if jobContent}
          <div class="content-section">
            <div class="job-details-card">
              <div class="job-meta">
                <span class="meta-item">📝 Job Description</span>
                <span class="meta-item">{jobDescription.length} characters</span>
                {#if !isEditingJob}
                  <button class="edit-btn" onclick={startEditingJob}>
                    ✏️ Edit
                  </button>
                {:else}
                  <div class="edit-actions">
                    <button class="save-btn" onclick={saveEditedJob}>
                      ✅ Save
                    </button>
                    <button class="cancel-btn" onclick={cancelEditingJob}>
                      ❌ Cancel
                    </button>
                  </div>
                {/if}
              </div>
              <div class="job-description-content">
                {#if isEditingJob && editedJobData}
                  <div class="dynamic-form">
                    {#each Object.keys(editedJobData) as key}
                      {#if !isNestedObject(editedJobData[key])}
                        <div class="form-field">
                          <label for="job-{key}">
                            {getFieldLabel(key)}
                            {#if key === 'details' || key === 'description'}
                              <span class="field-badge">Main Content</span>
                            {:else if isReadonlyField(key)}
                              <span class="field-badge readonly">Readonly</span>
                            {/if}
                          </label>
                          {#if key === 'details' || key === 'description'}
                            <textarea
                              id="job-{key}"
                              bind:value={editedJobData[key]}
                              rows="12"
                              class="form-textarea large"
                            ></textarea>
                          {:else if typeof editedJobData[key] === 'boolean'}
                            <label class="checkbox-label">
                              <input
                                type="checkbox"
                                id="job-{key}"
                                bind:checked={editedJobData[key]}
                                disabled={isReadonlyField(key)}
                              />
                              <span>Enabled</span>
                            </label>
                          {:else if typeof editedJobData[key] === 'number'}
                            <input
                              type="number"
                              id="job-{key}"
                              bind:value={editedJobData[key]}
                              class="form-input"
                              class:readonly={isReadonlyField(key)}
                              readonly={isReadonlyField(key)}
                            />
                          {:else}
                            <input
                              type="text"
                              id="job-{key}"
                              bind:value={editedJobData[key]}
                              class="form-input"
                              class:readonly={isReadonlyField(key)}
                              readonly={isReadonlyField(key)}
                            />
                          {/if}
                        </div>
                      {:else}
                        <div class="form-field nested">
                          <div class="nested-label">
                            {getFieldLabel(key)}
                            <span class="field-badge">Object</span>
                          </div>
                          <div class="nested-object">
                            {#each Object.keys(editedJobData[key]) as nestedKey}
                              <div class="nested-field">
                                <label for="job-{key}-{nestedKey}" class="nested-field-label">
                                  {getFieldLabel(nestedKey)}
                                  {#if isReadonlyField(nestedKey)}
                                    <span class="field-badge readonly small">Readonly</span>
                                  {/if}
                                </label>
                                {#if typeof editedJobData[key][nestedKey] === 'boolean'}
                                  <label class="checkbox-label">
                                    <input
                                      type="checkbox"
                                      id="job-{key}-{nestedKey}"
                                      bind:checked={editedJobData[key][nestedKey]}
                                      disabled={isReadonlyField(nestedKey)}
                                    />
                                    <span>Enabled</span>
                                  </label>
                                {:else if typeof editedJobData[key][nestedKey] === 'number'}
                                  <input
                                    type="number"
                                    id="job-{key}-{nestedKey}"
                                    bind:value={editedJobData[key][nestedKey]}
                                    class="form-input nested"
                                    class:readonly={isReadonlyField(nestedKey)}
                                    readonly={isReadonlyField(nestedKey)}
                                  />
                                {:else}
                                  <input
                                    type="text"
                                    id="job-{key}-{nestedKey}"
                                    bind:value={editedJobData[key][nestedKey]}
                                    class="form-input nested"
                                    class:readonly={isReadonlyField(nestedKey)}
                                    readonly={isReadonlyField(nestedKey)}
                                  />
                                {/if}
                              </div>
                            {/each}
                          </div>
                        </div>
                      {/if}
                    {/each}
                  </div>
                  <div class="edit-hint">
                    💡 <strong>Tip:</strong> Edit fields directly in the form. Changes apply to this session only (not saved to file).
                  </div>
                {:else}
                  <pre class="job-text">{jobDescription}</pre>
                {/if}
              </div>
            </div>
          </div>
        {/if}

        <!-- Tab 1: Original Fit Score -->
        {#if activeTab === 'original'}
          <div class="ats-tab-content">
            {#if originalAtsLoading}
              <div class="ats-loading">
                <div class="spinner"></div>
                <span>Calculating original fit score...</span>
              </div>
            {:else if originalAtsError}
              <div class="ats-error">
                <p>{originalAtsError}</p>
                <button class="retry-btn" onclick={fetchOriginalAts}>Retry</button>
              </div>
            {:else if originalAtsResult}
              {@const d = originalAtsResult}
              {@const overallNum = typeof d.overall_score === 'number' ? d.overall_score : parseInt(String(d.overall_score ?? ''), 10)}
              {@const overallCls = scoreClass(d.overall_score)}
              {@const reqArr = atsArray(d.required_skills).length ? atsArray(d.required_skills) : [...new Set([...atsArray(d.matching_skills), ...atsArray(d.missing_skills)])]}
              {@const matchArr = atsArray(d.matching_skills)}
              {@const missArr = atsArray(d.missing_skills)}
              <div class="ats-result">
                <h3 class="section-title">📊 Original Fit Score</h3>

                <div class="ats-hero ats-hero-{overallCls}">
                  <div class="ats-hero-gauge">
                    <div class="ats-gauge-ring" style="--score: {Number.isNaN(overallNum) ? 0 : Math.min(100, Math.max(0, overallNum))};"></div>
                    <div class="ats-hero-score">{d.overall_score ?? '—'}</div>
                  </div>
                  <div class="ats-hero-label">Overall Score / 100</div>
                </div>

                <div class="ats-section">
                  <h4 class="ats-section-title">Category Scores</h4>
                  <div class="ats-bar-grid">
                    <div class="ats-bar-item">
                      <div class="ats-bar-header"><span>Skills Match</span><span class="ats-score-val {scoreClass(d.skills_match)}">{d.skills_match ?? '—'}</span></div>
                      <div class="ats-bar-track"><div class="ats-bar-fill {scoreClass(d.skills_match)}" style="width: {typeof d.skills_match === 'number' ? d.skills_match : parseInt(String(d.skills_match ?? 0), 10)}%"></div></div>
                    </div>
                    <div class="ats-bar-item">
                      <div class="ats-bar-header"><span>Experience Match</span><span class="ats-score-val {scoreClass(d.experience_match)}">{d.experience_match ?? '—'}</span></div>
                      <div class="ats-bar-track"><div class="ats-bar-fill {scoreClass(d.experience_match)}" style="width: {typeof d.experience_match === 'number' ? d.experience_match : parseInt(String(d.experience_match ?? 0), 10)}%"></div></div>
                    </div>
                    <div class="ats-bar-item">
                      <div class="ats-bar-header"><span>Keyword Match</span><span class="ats-score-val {scoreClass(d.keyword_match)}">{d.keyword_match ?? '—'}</span></div>
                      <div class="ats-bar-track"><div class="ats-bar-fill {scoreClass(d.keyword_match)}" style="width: {typeof d.keyword_match === 'number' ? d.keyword_match : parseInt(String(d.keyword_match ?? 0), 10)}%"></div></div>
                    </div>
                    <div class="ats-bar-item">
                      <div class="ats-bar-header"><span>Education Match</span><span class="ats-score-val {scoreClass(d.education_match)}">{d.education_match ?? '—'}</span></div>
                      <div class="ats-bar-track"><div class="ats-bar-fill {scoreClass(d.education_match)}" style="width: {typeof d.education_match === 'number' ? d.education_match : parseInt(String(d.education_match ?? 0), 10)}%"></div></div>
                    </div>
                  </div>
                </div>

                {#if d.score_breakdown && typeof d.score_breakdown === 'object'}
                  <div class="ats-section">
                    <h4 class="ats-section-title">Score Breakdown</h4>
                    <div class="ats-bar-grid">
                      {#each Object.entries(d.score_breakdown as Record<string, unknown>) as [k, v]}
                        {@const vNum = typeof v === 'number' ? v : parseInt(String(v ?? 0), 10)}
                        <div class="ats-bar-item">
                          <div class="ats-bar-header"><span>{formatAtsLabel(k)}</span><span class="ats-score-val {scoreClass(v)}">{v ?? '—'}</span></div>
                          <div class="ats-bar-track"><div class="ats-bar-fill {scoreClass(v)}" style="width: {Number.isNaN(vNum) ? 0 : Math.min(100, Math.max(0, vNum))}%"></div></div>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}

                <div class="ats-section ats-section-list">
                  <h4 class="ats-section-title">📋 Required Skills</h4>
                  {#if reqArr.length}
                    <ul class="ats-skills-list ats-required-skills">
                      {#each reqArr as skill}
                        <li class="ats-skill-item {matchArr.some((m) => String(m).toLowerCase() === String(skill).toLowerCase()) ? 'skill-match' : 'skill-missing'}">{skill}</li>
                      {/each}
                    </ul>
                  {:else}
                    <p class="ats-empty-msg">None identified</p>
                  {/if}
                </div>

                <div class="ats-section ats-section-list">
                  <h4 class="ats-section-title">✅ Matching Skills</h4>
                  {#if matchArr.length}
                    <ul class="ats-skills-list">{#each matchArr as m}<li class="ats-skill-item skill-match">{m}</li>{/each}</ul>
                  {:else}
                    <p class="ats-empty-msg">None identified</p>
                  {/if}
                </div>

                <div class="ats-section ats-section-list">
                  <h4 class="ats-section-title">❌ Missing Skills</h4>
                  {#if missArr.length}
                    <ul class="ats-skills-list">{#each missArr as m}<li class="ats-skill-item skill-missing">{m}</li>{/each}</ul>
                  {:else}
                    <p class="ats-empty-msg">None identified</p>
                  {/if}
                </div>

                <div class="ats-section ats-section-list">
                  <h4 class="ats-section-title">💡 Recommendations</h4>
                  {#if atsRecommendationsBullets(d.recommendations).length}
                    <ul class="ats-list-ul">{#each atsRecommendationsBullets(d.recommendations) as r}<li>{r}</li>{/each}</ul>
                  {:else}
                    <p class="ats-empty-msg">None provided</p>
                  {/if}
                </div>

                <button class="refresh-ats-btn" onclick={fetchOriginalAts}>🔄 Refresh</button>
              </div>
            {:else}
              <div class="ats-empty">
                <p>Click <strong>"📊 Calculate Fit Score"</strong> in the top right to analyze your original resume against this job.</p>
                <button class="load-ats-btn" onclick={fetchOriginalAts} disabled={!originalResume || !jobDescription}>
                  Or click here to calculate
                </button>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Tab 2: Enhanced Resume -->
        {#if activeTab === 'enhanced'}
          {#if enhancedResume}
          <div class="result-container">
            <div class="generated-content">
              <pre class="cover-letter-text">{enhancedResume}</pre>
            </div>
          </div>
          {:else}
            <div class="tab-empty">
              <p>Click "Enhance Resume" above to generate your tailored resume.</p>
            </div>
          {/if}
        {/if}

        <!-- Tab 3: Final Fit Score -->
        {#if activeTab === 'final'}
          <div class="ats-tab-content">
            {#if finalAtsLoading}
              <div class="ats-loading">
                <div class="spinner"></div>
                <span>Calculating final fit score...</span>
              </div>
            {:else if finalAtsError}
              <div class="ats-error">
                <p>{finalAtsError}</p>
                <button class="retry-btn" onclick={fetchFinalAts}>Retry</button>
              </div>
            {:else if finalAtsResult}
              {@const d = finalAtsResult}
              {@const overallNum = typeof d.overall_score === 'number' ? d.overall_score : parseInt(String(d.overall_score ?? ''), 10)}
              {@const overallCls = scoreClass(d.overall_score)}
              {@const reqArr = atsArray(d.required_skills).length ? atsArray(d.required_skills) : [...new Set([...atsArray(d.matching_skills), ...atsArray(d.missing_skills)])]}
              {@const matchArr = atsArray(d.matching_skills)}
              {@const missArr = atsArray(d.missing_skills)}
              <div class="ats-result">
                <h3 class="section-title">📊 Final Fit Score</h3>

                <div class="ats-hero ats-hero-{overallCls}">
                  <div class="ats-hero-gauge">
                    <div class="ats-gauge-ring" style="--score: {Number.isNaN(overallNum) ? 0 : Math.min(100, Math.max(0, overallNum))};"></div>
                    <div class="ats-hero-score">{d.overall_score ?? '—'}</div>
                  </div>
                  <div class="ats-hero-label">Overall Score / 100</div>
                </div>

                <div class="ats-section">
                  <h4 class="ats-section-title">Category Scores</h4>
                  <div class="ats-bar-grid">
                    <div class="ats-bar-item">
                      <div class="ats-bar-header"><span>Skills Match</span><span class="ats-score-val {scoreClass(d.skills_match)}">{d.skills_match ?? '—'}</span></div>
                      <div class="ats-bar-track"><div class="ats-bar-fill {scoreClass(d.skills_match)}" style="width: {typeof d.skills_match === 'number' ? d.skills_match : parseInt(String(d.skills_match ?? 0), 10)}%"></div></div>
                    </div>
                    <div class="ats-bar-item">
                      <div class="ats-bar-header"><span>Experience Match</span><span class="ats-score-val {scoreClass(d.experience_match)}">{d.experience_match ?? '—'}</span></div>
                      <div class="ats-bar-track"><div class="ats-bar-fill {scoreClass(d.experience_match)}" style="width: {typeof d.experience_match === 'number' ? d.experience_match : parseInt(String(d.experience_match ?? 0), 10)}%"></div></div>
                    </div>
                    <div class="ats-bar-item">
                      <div class="ats-bar-header"><span>Keyword Match</span><span class="ats-score-val {scoreClass(d.keyword_match)}">{d.keyword_match ?? '—'}</span></div>
                      <div class="ats-bar-track"><div class="ats-bar-fill {scoreClass(d.keyword_match)}" style="width: {typeof d.keyword_match === 'number' ? d.keyword_match : parseInt(String(d.keyword_match ?? 0), 10)}%"></div></div>
                    </div>
                    <div class="ats-bar-item">
                      <div class="ats-bar-header"><span>Education Match</span><span class="ats-score-val {scoreClass(d.education_match)}">{d.education_match ?? '—'}</span></div>
                      <div class="ats-bar-track"><div class="ats-bar-fill {scoreClass(d.education_match)}" style="width: {typeof d.education_match === 'number' ? d.education_match : parseInt(String(d.education_match ?? 0), 10)}%"></div></div>
                    </div>
                  </div>
                </div>

                {#if d.score_breakdown && typeof d.score_breakdown === 'object'}
                  <div class="ats-section">
                    <h4 class="ats-section-title">Score Breakdown</h4>
                    <div class="ats-bar-grid">
                      {#each Object.entries(d.score_breakdown as Record<string, unknown>) as [k, v]}
                        {@const vNum = typeof v === 'number' ? v : parseInt(String(v ?? 0), 10)}
                        <div class="ats-bar-item">
                          <div class="ats-bar-header"><span>{formatAtsLabel(k)}</span><span class="ats-score-val {scoreClass(v)}">{v ?? '—'}</span></div>
                          <div class="ats-bar-track"><div class="ats-bar-fill {scoreClass(v)}" style="width: {Number.isNaN(vNum) ? 0 : Math.min(100, Math.max(0, vNum))}%"></div></div>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}

                <div class="ats-section ats-section-list">
                  <h4 class="ats-section-title">📋 Required Skills</h4>
                  {#if reqArr.length}
                    <ul class="ats-skills-list ats-required-skills">
                      {#each reqArr as skill}
                        <li class="ats-skill-item {matchArr.some((m) => String(m).toLowerCase() === String(skill).toLowerCase()) ? 'skill-match' : 'skill-missing'}">{skill}</li>
                      {/each}
                    </ul>
                  {:else}
                    <p class="ats-empty-msg">None identified</p>
                  {/if}
                </div>

                <div class="ats-section ats-section-list">
                  <h4 class="ats-section-title">✅ Matching Skills</h4>
                  {#if matchArr.length}
                    <ul class="ats-skills-list">{#each matchArr as m}<li class="ats-skill-item skill-match">{m}</li>{/each}</ul>
                  {:else}
                    <p class="ats-empty-msg">None identified</p>
                  {/if}
                </div>

                <div class="ats-section ats-section-list">
                  <h4 class="ats-section-title">❌ Missing Skills</h4>
                  {#if missArr.length}
                    <ul class="ats-skills-list">{#each missArr as m}<li class="ats-skill-item skill-missing">{m}</li>{/each}</ul>
                  {:else}
                    <p class="ats-empty-msg">None identified</p>
                  {/if}
                </div>

                <div class="ats-section ats-section-list">
                  <h4 class="ats-section-title">💡 Recommendations</h4>
                  {#if atsRecommendationsBullets(d.recommendations).length}
                    <ul class="ats-list-ul">{#each atsRecommendationsBullets(d.recommendations) as r}<li>{r}</li>{/each}</ul>
                  {:else}
                    <p class="ats-empty-msg">None provided</p>
                  {/if}
                </div>

                <button class="refresh-ats-btn" onclick={fetchFinalAts}>🔄 Refresh</button>
              </div>
            {:else}
              <div class="ats-empty">
                <p>Load the final fit score for your enhanced resume.</p>
                <button class="load-ats-btn" onclick={fetchFinalAts} disabled={!enhancedResume}>
                  Load Final Fit Score
                </button>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Tab 4: Compare -->
        {#if activeTab === 'compare'}
          <div class="ats-tab-content">
            {#if !enhancedResume}
              <div class="tab-empty">
                <p>Run enhancement first to compare original and enhanced resumes.</p>
              </div>
            {:else}
              {#if finalAtsLoading}
                <div class="ats-loading">
                  <div class="spinner"></div>
                  <span>Calculating final fit score...</span>
                </div>
              {:else if finalAtsError}
                <div class="ats-error">
                  <p>{finalAtsError}</p>
                  <button class="retry-btn" onclick={fetchFinalAts}>Retry</button>
                </div>
              {:else}
                {#if finalAtsResult}
                  {@const d = finalAtsResult}
                  <div class="compare-fit-summary">
                    <span class="compare-fit-label">Final Fit Score:</span>
                    <span class="compare-fit-value">{d.overall_score ?? '—'} / 100</span>
                  </div>
                {:else}
                  <div class="compare-fit-summary">
                    <button class="load-ats-btn" onclick={fetchFinalAts}>Calculate Final Fit Score</button>
                  </div>
                {/if}
              {/if}

              <div class="comparison-view" style="margin-top: 20px;">
                <div class="diff-toolbar">
                  <label class="diff-toggle">
                    <input type="checkbox" bind:checked={hideUnchanged} />
                    <span>Hide unchanged lines</span>
                  </label>
                </div>
                <div class="comparison-grid">
                  <div class="comparison-column">
                    <h4>Original Resume</h4>
                  </div>
                  <div class="comparison-column">
                    <h4>Enhanced Resume</h4>
                  </div>
                </div>
                <div class="comparison-content">
                  {#each (hideUnchanged ? generateDiff().filter((d) => d.type !== 'unchanged') : generateDiff()) as diffLine, i}
                    <div class="diff-row {diffLine.type}">
                      <div class="diff-cell">
                        <span class="line-num">
                          {diffLine.type === 'added'
                            ? '+'
                            : diffLine.type === 'removed'
                            ? '−'
                            : ''}{i + 1}
                        </span>
                        {#if diffLine.type === 'modified' && diffLine.originalTokens}
                          <pre class="line-text">
                            {#each diffLine.originalTokens as t, idx}
                              <span class="token {t.kind}">{t.text}</span>{#if idx < diffLine.originalTokens.length - 1} {' '}{/if}
                            {/each}
                          </pre>
                        {:else}
                          <pre class="line-text">{diffLine.original}</pre>
                        {/if}
                      </div>
                      <div class="diff-cell">
                        <span class="line-num">
                          {diffLine.type === 'added'
                            ? '+'
                            : diffLine.type === 'removed'
                            ? '−'
                            : ''}{i + 1}
                        </span>
                        {#if diffLine.type === 'modified' && diffLine.enhancedTokens}
                          <pre class="line-text">
                            {#each diffLine.enhancedTokens as t, idx}
                              <span class="token {t.kind}">{t.text}</span>{#if idx < diffLine.enhancedTokens.length - 1} {' '}{/if}
                            {/each}
                          </pre>
                        {:else}
                          <pre class="line-text">{diffLine.enhanced}</pre>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
                <div class="diff-legend">
                  <span class="legend-item added">Added</span>
                  <span class="legend-item removed">Removed</span>
                  <span class="legend-item modified">Modified</span>
                  <span class="legend-item unchanged">Unchanged</span>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  </div>
</main>

<style>
  /* Resume Selector Section */
  .resume-selector-section {
    background: rgba(102, 126, 234, 0.05);
    border: 1px solid rgba(102, 126, 234, 0.2);
    border-radius: 8px;
    padding: 16px 20px;
    margin-bottom: 20px;
  }

  .resume-loading {
    display: flex;
    align-items: center;
    gap: 12px;
    justify-content: center;
    padding: 20px;
    color: inherit;
    opacity: 0.7;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 3px solid rgba(102, 126, 234, 0.2);
    border-top-color: #667eea;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .resume-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 30px 20px;
    text-align: center;
  }

  .empty-icon {
    font-size: 2.5rem;
    opacity: 0.5;
  }

  .resume-selector {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .selector-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 0.95rem;
    color: inherit;
    cursor: pointer;
  }

  .label-icon {
    font-size: 1.1rem;
  }

  .label-text {
    color: inherit;
  }

  .selector-wrapper {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .resume-dropdown {
    flex: 1;
    padding: 10px 14px;
    font-size: 0.95rem;
    font-family: inherit;
    border: 2px solid rgba(102, 126, 234, 0.3);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.8);
    color: inherit;
    cursor: pointer;
    transition: all 0.2s;
  }

  .resume-dropdown:hover {
    border-color: #667eea;
  }

  .resume-dropdown:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
  }

  .refresh-icon-btn {
    padding: 8px 12px;
    background: transparent;
    border: 1px solid rgba(128, 128, 128, 0.3);
    border-radius: 6px;
    font-size: 1.1rem;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .refresh-icon-btn:hover:not(:disabled) {
    background: rgba(102, 126, 234, 0.1);
    border-color: #667eea;
  }

  .refresh-icon-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .resume-loaded-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(40, 167, 69, 0.1);
    border-left: 3px solid #28a745;
    border-radius: 4px;
    font-size: 0.85rem;
  }

  .indicator-icon {
    color: #28a745;
    font-weight: bold;
    font-size: 1rem;
  }

  .indicator-text {
    color: inherit;
    opacity: 0.8;
  }

  .section-title {
    margin: 0 0 15px 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: inherit;
  }

  /* Job Header - top of right panel */
  .job-header-section {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    flex-wrap: wrap;
  }
  .job-info {
    flex: 1;
    min-width: 0;
  }

  /* Generate Section - top right of panel */
  .generate-section {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-shrink: 0;
  }

  .calculate-fit-btn {
    padding: 10px 20px;
    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.95rem;
    font-weight: 600;
    box-shadow: 0 2px 6px rgba(34, 197, 94, 0.3);
    transition: all 0.2s;
  }
  .calculate-fit-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
  }
  .calculate-fit-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .generate-btn {
    padding: 12px 30px;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 600;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    transition: all 0.2s;
  }

  .generate-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
  }

  .generate-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .refresh-btn {
    background: transparent;
    border: 1px solid rgba(128, 128, 128, 0.3);
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.2s;
  }

  .refresh-btn:hover:not(:disabled) {
    border-color: purple;
    background: rgba(128, 0, 128, 0.1);
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .prompt-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .save-btn-small {
    background: #28a745;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    transition: all 0.2s;
  }

  .save-btn-small:hover:not(:disabled) {
    background: #218838;
    transform: translateY(-1px);
  }

  .save-btn-small:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .reset-btn-small {
    background: transparent;
    border: 1px solid rgba(128, 128, 128, 0.4);
    color: inherit;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    transition: all 0.2s;
  }

  .reset-btn-small:hover {
    border-color: orange;
    background: rgba(255, 165, 0, 0.1);
  }

  .prompt-hint {
    padding: 10px 15px;
    background: rgba(102, 126, 234, 0.1);
    border-left: 4px solid #667eea;
    margin-top: 10px;
    border-radius: 4px;
    font-size: 0.85rem;
    color: inherit;
  }

  .header-buttons {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .add-job-btn {
    background: #667eea;
    color: white;
    border: none;
    padding: 6px 15px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
    transition: all 0.2s;
  }

  .add-job-btn:hover {
    background: #5568d3;
    transform: translateY(-1px);
  }

  /* Job Form */
  .job-form {
    background: rgba(102, 126, 234, 0.05);
    border: 2px solid #667eea;
    border-radius: 10px;
    padding: 20px;
    margin-bottom: 20px;
  }

  .form-title {
    margin: 0 0 20px 0;
    font-size: 1.2rem;
    font-weight: 600;
    color: #667eea;
  }

  .form-group {
    margin-bottom: 15px;
  }

  .form-group label {
    display: block;
    margin-bottom: 6px;
    font-weight: 600;
    font-size: 0.9rem;
    color: inherit;
  }

  .form-group input,
  .form-group textarea {
    width: 100%;
    padding: 10px 12px;
    border: 2px solid rgba(128, 128, 128, 0.3);
    border-radius: 6px;
    font-size: 0.9rem;
    font-family: inherit;
    background: rgba(255, 255, 255, 0.8);
    color: inherit;
    transition: border-color 0.2s;
  }

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
  }

  .form-group textarea {
    font-family: 'Monaco', 'Courier New', monospace;
    resize: vertical;
  }

  .save-job-btn {
    width: 100%;
    background: #28a745;
    color: white;
    border: none;
    padding: 12px 20px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 600;
    transition: all 0.2s;
  }

  .save-job-btn:hover {
    background: #218838;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
  }

  /* Content Section */
  .content-section {
    padding: 25px;
  }

  .job-meta {
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 15px 20px;
    background: rgba(128, 128, 128, 0.1);
    border-bottom: 1px solid rgba(128, 128, 128, 0.2);
    flex-wrap: wrap;
  }

  .meta-item {
    font-size: 0.9rem;
    color: inherit;
    opacity: 0.8;
  }

  .edit-btn {
    margin-left: auto;
    background: #667eea;
    color: white;
    border: none;
    padding: 6px 15px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    transition: all 0.2s;
  }

  .edit-btn:hover {
    background: #5568d3;
    transform: translateY(-1px);
  }

  .edit-actions {
    margin-left: auto;
    display: flex;
    gap: 8px;
  }

  .save-btn {
    background: #28a745;
    color: white;
    border: none;
    padding: 6px 15px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    transition: all 0.2s;
  }

  .save-btn:hover {
    background: #218838;
    transform: translateY(-1px);
  }

  .cancel-btn {
    background: #dc3545;
    color: white;
    border: none;
    padding: 6px 15px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    transition: all 0.2s;
  }

  .cancel-btn:hover {
    background: #c82333;
    transform: translateY(-1px);
  }

  .job-text-editor {
    width: 100%;
    padding: 20px;
    font-family: 'Monaco', 'Courier New', monospace;
    font-size: 0.9rem;
    line-height: 1.6;
    border: 2px solid #667eea;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.8);
    color: inherit;
    resize: vertical;
    min-height: 400px;
  }

  .job-text-editor:focus {
    outline: none;
    border-color: #5568d3;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
  }

  .edit-hint {
    padding: 12px 18px;
    background: rgba(102, 126, 234, 0.1);
    border-left: 4px solid #667eea;
    margin-top: 10px;
    border-radius: 4px;
    font-size: 0.85rem;
    color: inherit;
  }

  .job-description-content {
    padding: 20px;
  }

  /* Dynamic Form Styles */
  .dynamic-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-height: 600px;
    overflow-y: auto;
    padding-right: 10px;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .form-field label {
    font-weight: 600;
    font-size: 0.95rem;
    color: inherit;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .field-badge {
    display: inline-block;
    padding: 2px 8px;
    background: rgba(102, 126, 234, 0.2);
    color: #667eea;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .field-badge.readonly {
    background: rgba(128, 128, 128, 0.2);
    color: #666;
  }

  .field-badge.small {
    font-size: 0.65rem;
    padding: 1px 6px;
  }

  .form-input {
    width: 100%;
    padding: 10px 12px;
    border: 2px solid rgba(128, 128, 128, 0.3);
    border-radius: 6px;
    font-size: 0.9rem;
    font-family: inherit;
    background: rgba(255, 255, 255, 0.8);
    color: inherit;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .form-input:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
  }

  .form-input.readonly,
  .form-input:read-only {
    background: rgba(128, 128, 128, 0.1);
    color: #666;
    cursor: not-allowed;
    border-color: rgba(128, 128, 128, 0.2);
  }

  .form-input.readonly:focus,
  .form-input:read-only:focus {
    border-color: rgba(128, 128, 128, 0.3);
    box-shadow: none;
  }

  .form-textarea {
    width: 100%;
    padding: 12px 15px;
    border: 2px solid rgba(128, 128, 128, 0.3);
    border-radius: 6px;
    font-size: 0.9rem;
    font-family: 'Monaco', 'Courier New', monospace;
    background: rgba(255, 255, 255, 0.8);
    color: inherit;
    resize: vertical;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .form-textarea.large {
    min-height: 200px;
  }

  .form-textarea:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-weight: normal;
  }

  .checkbox-label input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  /* Nested Object Styles */
  .form-field.nested {
    background: rgba(102, 126, 234, 0.05);
    border: 1px solid rgba(102, 126, 234, 0.2);
    border-radius: 8px;
    padding: 15px;
  }

  .nested-label {
    font-size: 1rem;
    font-weight: 700;
    color: #667eea;
    margin-bottom: 10px;
  }

  .nested-object {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 10px;
  }

  .nested-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .nested-field-label {
    font-weight: 500;
    font-size: 0.85rem;
    color: rgba(0, 0, 0, 0.7);
  }

  .form-input.nested {
    font-size: 0.85rem;
    padding: 8px 10px;
  }

  /* Scrollbar Styling */
  .dynamic-form::-webkit-scrollbar {
    width: 8px;
  }

  .dynamic-form::-webkit-scrollbar-track {
    background: rgba(128, 128, 128, 0.1);
    border-radius: 4px;
  }

  .dynamic-form::-webkit-scrollbar-thumb {
    background: rgba(102, 126, 234, 0.5);
    border-radius: 4px;
  }

  .dynamic-form::-webkit-scrollbar-thumb:hover {
    background: rgba(102, 126, 234, 0.7);
  }

  .job-text {
    margin: 0;
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: 'Monaco', 'Courier New', monospace;
    font-size: 0.9rem;
    line-height: 1.6;
    color: inherit;
  }

  /* Analysis Stats */
  .analysis-stats {
    background: rgba(128, 128, 128, 0.1);
    border: 2px solid dodgerblue;
    border-radius: 8px;
    padding: 25px;
    margin-bottom: 20px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 15px;
  }

  .stat-card {
    background: rgba(255, 255, 255, 0.5);
    padding: 15px;
    border-radius: 8px;
    text-align: center;
    border: 1px solid rgba(128, 128, 128, 0.2);
  }

  .stat-card.improvement {
    background: rgba(40, 167, 69, 0.1);
    border-color: #28a745;
  }

  .stat-label {
    font-size: 0.85rem;
    color: inherit;
    opacity: 0.8;
    margin-bottom: 8px;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: bold;
    color: purple;
  }

  .stat-value.success {
    color: #28a745;
  }

  .stat-value.added {
    color: #28a745;
  }

  .stat-value.removed {
    color: #dc3545;
  }

  /* Result Container */
  .result-container {
    background: transparent;
    border: 2px solid purple;
    border-radius: 8px;
    overflow: hidden;
  }

  .result-header {
    background: rgba(128, 128, 128, 0.1);
    padding: 20px 25px;
    border-bottom: 1px solid rgba(128, 128, 128, 0.3);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 15px;
  }

  .header-actions {
    display: flex;
    gap: 15px;
    align-items: center;
    flex-wrap: wrap;
  }

  .view-toggle {
    display: flex;
    gap: 5px;
    background: rgba(128, 128, 128, 0.1);
    padding: 4px;
    border-radius: 6px;
  }

  .view-btn {
    background: transparent;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
    color: inherit;
  }

  .view-btn.active {
    background: purple;
    color: white;
  }

  .view-btn:hover:not(.active) {
    background: rgba(128, 0, 128, 0.2);
  }

  .download-actions {
    display: flex;
    gap: 8px;
  }

  .download-btn {
    background: mediumseagreen;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  .download-btn:hover {
    background: seagreen;
    transform: translateY(-2px);
  }

  .compare-fit-summary {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px;
    background: rgba(102, 126, 234, 0.1);
    border-radius: 8px;
    border: 1px solid rgba(102, 126, 234, 0.3);
  }
  .compare-fit-label {
    font-weight: 600;
    font-size: 0.95rem;
    color: inherit;
  }
  .compare-fit-value {
    font-weight: 800;
    font-size: 1.2rem;
    color: #667eea;
  }

  /* Comparison View */
  .comparison-view {
    background: transparent;
  }

  .diff-toolbar {
    display: flex;
    justify-content: flex-end;
    padding: 8px 20px 0 20px;
  }

  .diff-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    opacity: 0.8;
    cursor: pointer;
  }

  .diff-toggle input[type='checkbox'] {
    cursor: pointer;
  }

  .comparison-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    background: rgba(128, 128, 128, 0.1);
    border-bottom: 2px solid rgba(128, 128, 128, 0.3);
  }

  .comparison-column {
    padding: 15px 20px;
    text-align: center;
  }

  .comparison-column:first-child {
    border-right: 1px solid rgba(128, 128, 128, 0.3);
  }

  .comparison-column h4 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: inherit;
  }

  .comparison-content {
    max-height: 600px;
    overflow-y: auto;
  }

  .diff-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-bottom: 1px solid rgba(128, 128, 128, 0.1);
  }

  .diff-row.added {
    background: rgba(40, 167, 69, 0.15);
  }

  .diff-row.removed {
    background: rgba(220, 53, 69, 0.15);
  }

  .diff-row.modified {
    background: rgba(255, 193, 7, 0.15);
  }

  .diff-row.unchanged {
    background: transparent;
  }

  .diff-cell {
    padding: 8px 12px;
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .diff-cell:first-child {
    border-right: 1px solid rgba(128, 128, 128, 0.2);
  }

  .line-num {
    min-width: 40px;
    text-align: right;
    color: inherit;
    opacity: 0.5;
    font-size: 0.8rem;
    font-family: monospace;
    user-select: none;
    flex-shrink: 0;
  }

  .line-text {
    margin: 0;
    flex: 1;
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: 'Monaco', 'Courier New', monospace;
    font-size: 0.85rem;
    line-height: 1.5;
    color: inherit;
  }

  .diff-legend {
    display: flex;
    gap: 15px;
    padding: 15px 20px;
    background: rgba(128, 128, 128, 0.1);
    border-top: 1px solid rgba(128, 128, 128, 0.3);
    justify-content: center;
    flex-wrap: wrap;
  }

  .token {
    white-space: pre-wrap;
  }

  .token.added {
    background: rgba(40, 167, 69, 0.25);
  }

  .token.removed {
    background: rgba(220, 53, 69, 0.25);
    text-decoration: line-through;
  }

  .token.unchanged {
    background: transparent;
  }

  .legend-item {
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    border: 1px solid rgba(128, 128, 128, 0.3);
  }

  .legend-item.added {
    background: rgba(40, 167, 69, 0.15);
    border-color: #28a745;
    color: inherit;
  }

  .legend-item.removed {
    background: rgba(220, 53, 69, 0.15);
    border-color: #dc3545;
    color: inherit;
  }

  .legend-item.modified {
    background: rgba(255, 193, 7, 0.15);
    border-color: #ffc107;
    color: inherit;
  }

  .legend-item.unchanged {
    background: transparent;
    border-color: rgba(128, 128, 128, 0.3);
    color: inherit;
  }

  /* Placeholder */
  .placeholder-icon {
    font-size: 4rem;
    margin-bottom: 20px;
  }

  /* Resume Tabs */
  .resume-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 20px;
    border-bottom: 2px solid rgba(128, 128, 128, 0.3);
    padding-bottom: 0;
  }
  .resume-tab {
    padding: 10px 20px;
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    color: inherit;
    opacity: 0.7;
    transition: all 0.2s;
  }
  .resume-tab:hover:not(:disabled) {
    opacity: 1;
    color: #667eea;
  }
  .resume-tab.active {
    opacity: 1;
    color: #667eea;
    border-bottom-color: #667eea;
  }
  .resume-tab:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .ats-tab-content {
    padding: 25px;
    background: rgba(102, 126, 234, 0.03);
    border: 2px solid rgba(102, 126, 234, 0.2);
    border-radius: 8px;
  }
  .ats-loading {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 40px;
    justify-content: center;
    color: inherit;
    opacity: 0.8;
  }
  .ats-error {
    padding: 20px;
    background: rgba(220, 53, 69, 0.1);
    border: 1px solid rgba(220, 53, 69, 0.3);
    border-radius: 8px;
    color: inherit;
  }
  .ats-error p { margin: 0 0 12px 0; }
  .retry-btn {
    background: #dc3545;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
  }
  .ats-result {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .ats-hero {
    text-align: center;
    padding: 24px;
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.1) 100%);
    border-radius: 12px;
    border: 2px solid rgba(102, 126, 234, 0.3);
  }
  .ats-hero-gauge {
    position: relative;
    width: 120px;
    height: 120px;
    margin: 0 auto 12px;
  }
  .ats-gauge-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: conic-gradient(
      #22c55e calc(var(--score, 0) * 3.6deg),
      rgba(128, 128, 128, 0.2) calc(var(--score, 0) * 3.6deg)
    );
  }
  .ats-hero-gauge .ats-gauge-ring::after {
    content: '';
    position: absolute;
    inset: 8px;
    border-radius: 50%;
    background: var(--panel-bg, rgba(255, 255, 255, 0.95));
  }
  .ats-hero-gauge .ats-hero-score {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    margin: 0;
    z-index: 2;
  }
  .ats-hero.ats-hero-high .ats-gauge-ring { background: conic-gradient(#22c55e calc(var(--score, 0) * 3.6deg), rgba(128, 128, 128, 0.2) calc(var(--score, 0) * 3.6deg)); }
  .ats-hero.ats-hero-high .ats-hero-score { color: #16a34a; }
  .ats-hero.ats-hero-medium .ats-gauge-ring { background: conic-gradient(#f59e0b calc(var(--score, 0) * 3.6deg), rgba(128, 128, 128, 0.2) calc(var(--score, 0) * 3.6deg)); }
  .ats-hero.ats-hero-medium .ats-hero-score { color: #d97706; }
  .ats-hero.ats-hero-low .ats-gauge-ring { background: conic-gradient(#ef4444 calc(var(--score, 0) * 3.6deg), rgba(128, 128, 128, 0.2) calc(var(--score, 0) * 3.6deg)); }
  .ats-hero.ats-hero-low .ats-hero-score { color: #dc2626; }
  .ats-hero.ats-hero-none .ats-gauge-ring { background: conic-gradient(#6b7280 calc(var(--score, 0) * 3.6deg), rgba(128, 128, 128, 0.2) calc(var(--score, 0) * 3.6deg)); }
  .ats-hero.ats-hero-none .ats-hero-score { color: #6b7280; }
  .ats-hero-score {
    font-size: 3rem;
    font-weight: 800;
    color: #667eea;
    line-height: 1;
  }
  .ats-hero-label {
    font-size: 0.9rem;
    opacity: 0.85;
    margin-top: 4px;
    color: inherit;
  }
  .ats-section {
    padding: 16px;
    background: rgba(255, 255, 255, 0.4);
    border-radius: 8px;
    border: 1px solid rgba(128, 128, 128, 0.15);
  }
  .ats-section-title {
    margin: 0 0 12px 0;
    font-size: 1rem;
    font-weight: 600;
    color: inherit;
  }
  .ats-section-list {
    min-height: 60px;
  }
  .ats-bar-grid {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .ats-bar-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ats-bar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.9rem;
  }
  .ats-bar-header span:first-child { opacity: 0.9; }
  .ats-bar-track {
    height: 8px;
    background: rgba(128, 128, 128, 0.2);
    border-radius: 4px;
    overflow: hidden;
  }
  .ats-bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.4s ease;
  }
  .ats-bar-fill.high { background: linear-gradient(90deg, #22c55e, #16a34a); }
  .ats-bar-fill.medium { background: linear-gradient(90deg, #f59e0b, #d97706); }
  .ats-bar-fill.low { background: linear-gradient(90deg, #ef4444, #dc2626); }
  .ats-bar-fill.none { background: linear-gradient(90deg, #6b7280, #4b5563); }
  .ats-score-val.high { color: #16a34a; }
  .ats-score-val.medium { color: #d97706; }
  .ats-score-val.low { color: #dc2626; }
  .ats-score-val.none { color: #6b7280; }
  .ats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .ats-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    background: rgba(255,255,255,0.6);
    border-radius: 8px;
    border: 1px solid rgba(128,128,128,0.2);
  }
  .ats-item span:first-child { font-size: 0.85rem; opacity: 0.85; }
  .ats-score-val { font-weight: 700; font-size: 1.15rem; }
  .ats-breakdown-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .ats-breakdown-item {
    padding: 10px 16px;
    background: rgba(102, 126, 234, 0.12);
    border-radius: 8px;
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .ats-breakdown-item span:first-child { font-size: 0.9rem; }
  .ats-list-ul {
    margin: 0;
    padding-left: 24px;
    line-height: 1.7;
    color: inherit;
    list-style-type: disc;
  }
  .ats-list-ul li {
    margin-bottom: 6px;
  }
  .ats-skills-list {
    margin: 0;
    padding-left: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .ats-skills-list li {
    margin-bottom: 0;
  }
  .ats-skill-item {
    display: inline-block;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
  }
  .ats-skill-item.skill-match {
    background: rgba(34, 197, 94, 0.2);
    color: #16a34a;
    border: 1px solid rgba(34, 197, 94, 0.4);
  }
  .ats-skill-item.skill-missing {
    background: rgba(239, 68, 68, 0.2);
    color: #dc2626;
    border: 1px solid rgba(239, 68, 68, 0.4);
  }
  .ats-empty-msg {
    margin: 0;
    font-size: 0.9rem;
    opacity: 0.7;
  }
  .ats-empty, .tab-empty {
    padding: 40px;
    text-align: center;
    color: inherit;
    opacity: 0.8;
  }
  .load-ats-btn, .refresh-ats-btn {
    margin-top: 12px;
    background: #667eea;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
  }
  .load-ats-btn:hover:not(:disabled), .refresh-ats-btn:hover {
    background: #5568d3;
  }
  .load-ats-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Progress Bar */
  .progress-bar {
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, #28a745, #20c997);
    animation: progress 1.5s ease-in-out infinite;
  }

  @keyframes progress {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }

  /* Responsive */
  @media (max-width: 768px) {
    .job-header-section {
      flex-direction: column;
    }
    .generate-section {
      width: 100%;
      justify-content: flex-end;
    }
    .ats-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .comparison-grid,
    .diff-row {
      grid-template-columns: 1fr;
    }

    .diff-cell:first-child {
      border-right: none;
      border-bottom: 1px solid rgba(128, 128, 128, 0.2);
    }

    .header-actions {
      width: 100%;
      flex-direction: column;
    }

    .view-toggle,
    .download-actions {
      width: 100%;
    }

    .view-btn,
    .download-btn {
      flex: 1;
    }
  }
</style>
