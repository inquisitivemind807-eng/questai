<script>
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';

	// Use local proxy to avoid CORS
	const API_BASE = '/api-test/proxy';
	const CORPUS_RAG_API = env.PUBLIC_API_BASE || import.meta.env.VITE_API_BASE || 'http://localhost:3000';

	// State
	let selectedJob = '';
	let jobs = [];
	let jobData = null;
	let loading = false;
	let response = '';
	let error = '';
	let jwtToken = '';
	let authStatus = 'checking'; // checking, authenticated, unauthenticated

	onMount(async () => {
		// Get JWT token first
		await getJwtToken();
		// Load available jobs
		await loadJobs();
	});

	async function getJwtToken() {
		authStatus = 'checking';
		try {
			// Get session token from localStorage
			const sessionToken = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
			
			if (!sessionToken) {
				authStatus = 'unauthenticated';
				error = 'No session token found. Please login first.';
				return;
			}

			// Convert session token to JWT
			const res = await fetch(`${CORPUS_RAG_API}/api/auth/session-to-jwt`, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${sessionToken}`,
					'Content-Type': 'application/json'
				}
			});

			if (!res.ok) {
				const data = await res.json();
				authStatus = 'unauthenticated';
				error = `Failed to get JWT token: ${data.error || 'Authentication failed'}`;
				return;
			}

			const data = await res.json();
			if (data.success && data.accessToken) {
				jwtToken = data.accessToken;
				authStatus = 'authenticated';
				error = '';
			} else {
				authStatus = 'unauthenticated';
				error = 'Failed to get JWT token';
			}
		} catch (err) {
			authStatus = 'unauthenticated';
			error = `Error getting JWT token: ${err.message}`;
		}
	}

	async function loadJobs() {
		try {
			const res = await fetch('/api-test/jobs');
			if (res.ok) {
				jobs = await res.json();
				if (jobs.length > 0) {
					selectedJob = jobs[0].id;
					await loadJobData(selectedJob);
				}
			}
		} catch (err) {
			console.error('Failed to load jobs:', err);
		}
	}

	async function loadJobData(jobId) {
		try {
			const res = await fetch(`/api-test/jobs/${jobId}`);
			if (res.ok) {
				jobData = await res.json();
			}
		} catch (err) {
			console.error('Failed to load job data:', err);
		}
	}

	async function handleJobChange(e) {
		selectedJob = e.target.value;
		await loadJobData(selectedJob);
		response = '';
		error = '';
	}

	async function testCoverLetter() {
		if (!jobData) return;
		if (!jwtToken) {
			error = 'No JWT token available. Please login first.';
			return;
		}
		loading = true;
		error = '';
		response = '';

		try {
			const res = await fetch(`${API_BASE}/cover-letter`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${jwtToken}`
				},
				body: JSON.stringify({
					job_id: jobData.job_id,
					job_details: jobData.job_details,
					resume_text: jobData.resume_text,
					useAi: 'deepseek-chat',
					platform: 'seek',
					job_title: jobData.job_title,
					company: jobData.company
				})
			});

			if (!res.ok) {
				const text = await res.text();
				error = `HTTP ${res.status}: ${text}`;
			} else {
				const data = await res.json();
				response = JSON.stringify(data, null, 2);
			}
		} catch (err) {
			error = err.message;
		} finally {
			loading = false;
		}
	}

	async function testResume() {
		if (!jobData) return;
		if (!jwtToken) {
			error = 'No JWT token available. Please login first.';
			return;
		}
		loading = true;
		error = '';
		response = '';

		try {
			const res = await fetch(`${API_BASE}/resume`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${jwtToken}`
				},
				body: JSON.stringify({
					job_id: jobData.job_id,
					job_details: jobData.job_details,
					resume_text: jobData.resume_text,
					useAi: 'deepseek-chat',
					platform: 'seek',
					job_title: jobData.job_title,
					company: jobData.company
				})
			});

			if (!res.ok) {
				const text = await res.text();
				error = `HTTP ${res.status}: ${text}`;
			} else {
				const data = await res.json();
				response = JSON.stringify(data, null, 2);
			}
		} catch (err) {
			error = err.message;
		} finally {
			loading = false;
		}
	}

	async function testQnA() {
		if (!jobData || !jobData.questions) return;
		if (!jwtToken) {
			error = 'No JWT token available. Please login first.';
			return;
		}
		loading = true;
		error = '';
		response = '';

		try {
			const res = await fetch(`${API_BASE}/qna`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${jwtToken}`
				},
				body: JSON.stringify({
					job_id: jobData.job_id,
					questions: jobData.questions,
					resume_text: jobData.resume_text,
					useAi: 'deepseek-chat',
					job_details: jobData.job_details,
					platform: 'seek',
					job_title: jobData.job_title,
					company: jobData.company
				})
			});

			if (!res.ok) {
				const text = await res.text();
				error = `HTTP ${res.status}: ${text}`;
			} else {
				const data = await res.json();
				response = JSON.stringify(data, null, 2);
			}
		} catch (err) {
			error = err.message;
		} finally {
			loading = false;
		}
	}
</script>

<div class="min-h-screen bg-base-200">
	<div class="navbar bg-base-100 shadow-lg">
		<div class="flex-1">
			<h1 class="text-xl font-bold px-4">Corpus-RAG API Tester</h1>
		</div>
		<div class="flex-none gap-2">
			{#if authStatus === 'checking'}
				<div class="badge badge-info gap-2">
					<span class="loading loading-spinner loading-xs"></span>
					Checking Auth...
				</div>
			{:else if authStatus === 'authenticated'}
				<div class="badge badge-success gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-4 h-4 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
					Authenticated
				</div>
			{:else}
				<div class="badge badge-error gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-4 h-4 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
					Not Authenticated
				</div>
			{/if}
		</div>
	</div>

	<div class="p-6 max-w-4xl mx-auto">
		<!-- Auth Status -->
		{#if authStatus === 'unauthenticated'}
			<div class="alert alert-error shadow-lg mb-6">
				<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
				<div>
					<h3 class="font-bold">Authentication Required</h3>
					<div class="text-sm">{error || 'Please login to use the API tester.'}</div>
					<div class="mt-2">
						<button class="btn btn-sm btn-primary" on:click={getJwtToken}>Retry Authentication</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- Job Selection -->
		<div class="card bg-base-100 shadow-xl mb-6">
			<div class="card-body">
				<h2 class="card-title text-lg">Select Test Job</h2>
				<select
					bind:value={selectedJob}
					on:change={handleJobChange}
					class="select select-bordered w-full"
				>
					{#each jobs as job}
						<option value={job.id}>Job #{job.id}</option>
					{/each}
				</select>

				{#if jobData}
					<div class="divider">Job Data Preview</div>
					<div class="bg-base-200 p-3 rounded text-xs max-h-48 overflow-auto">
						<div><strong>Title:</strong> {jobData.job_title}</div>
						<div><strong>Company:</strong> {jobData.company}</div>
						<div class="mt-2 text-xs opacity-70">
							{jobData.job_details.substring(0, 200)}...
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Test Actions -->
		<div class="card bg-base-100 shadow-xl mb-6">
			<div class="card-body">
				<h2 class="card-title text-lg">Test APIs</h2>
				<div class="grid grid-cols-3 gap-4">
					<button
						class="btn btn-primary {loading ? 'loading' : ''}"
						on:click={testCoverLetter}
						disabled={loading || !jobData}
					>
						{loading ? '' : '📝 Cover Letter'}
					</button>
					<button
						class="btn btn-secondary {loading ? 'loading' : ''}"
						on:click={testResume}
						disabled={loading || !jobData}
					>
						{loading ? '' : '📄 Resume'}
					</button>
					<button
						class="btn btn-accent {loading ? 'loading' : ''}"
						on:click={testQnA}
						disabled={loading || !jobData || !jobData.questions}
					>
						{loading ? '' : '❓ Q&A'}
					</button>
				</div>
			</div>
		</div>

		<!-- Response -->
		{#if error}
			<div class="alert alert-error shadow-lg mb-6">
				<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
				<span class="text-sm">{error}</span>
			</div>
		{/if}

		{#if response}
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
					<h2 class="card-title text-lg">API Response</h2>
					<div class="divider my-0"></div>
					<pre class="bg-base-200 p-4 rounded text-xs overflow-auto max-h-96">{response}</pre>
				</div>
			</div>
		{/if}
	</div>
</div>
