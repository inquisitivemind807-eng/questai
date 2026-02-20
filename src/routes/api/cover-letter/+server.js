import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const API_BASE = env.API_BASE || process.env.API_BASE || 'http://localhost:3000';
const ALLOWED_RESUME_EXTENSIONS = ['.doc', '.docx', '.pdf'];

/** @param {string} name */
function isSupportedResumeFile(name) {
  const lower = String(name || '').toLowerCase();
  return ALLOWED_RESUME_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** @param {string} userId @param {string} authHeader @param {string} [preferredResumeFileName] */
async function loadResumeFromUploads(userId, authHeader, preferredResumeFileName = '') {
  if (!userId) {
    throw new Error('Missing userId. Cannot resolve uploaded resume.');
  }
  const listRes = await fetch(`${API_BASE}/api/upload?userId=${encodeURIComponent(userId)}`, {
    method: 'GET',
    headers: {
      'Authorization': authHeader
    }
  });
  if (!listRes.ok) {
    throw new Error(`Failed to list uploaded resumes (${listRes.status})`);
  }
  const listData = await listRes.json();
  const files = Array.isArray(listData?.files) ? /** @type {Array<{name?: string}>} */ (listData.files) : [];
  if (files.length === 0) {
    throw new Error(`No uploaded resumes found for userId ${userId}`);
  }

  const names = files
    .map((f) => f?.name)
    .filter((name) => typeof name === 'string' && isSupportedResumeFile(name))
    .map((name) => String(name));
  if (names.length === 0) {
    throw new Error(`No uploaded .doc/.docx/.pdf resume files found for userId ${userId}`);
  }

  const selectedName =
    (preferredResumeFileName && names.includes(preferredResumeFileName) ? preferredResumeFileName : '') ||
    names.find((name) => String(name).toLowerCase().includes('resume')) ||
    names[0];

  const fileRes = await fetch(
    `${API_BASE}/api/upload?userId=${encodeURIComponent(userId)}&filename=${encodeURIComponent(selectedName)}`,
    {
      method: 'GET',
      headers: {
        'Authorization': authHeader
      }
    }
  );
  if (!fileRes.ok) {
    const fileErr = await fileRes.json().catch(() => ({}));
    throw new Error(fileErr?.error || `Failed to load uploaded resume file (${fileRes.status})`);
  }
  const fileData = await fileRes.json();
  const content = typeof fileData?.content === 'string' ? fileData.content.trim() : '';
  if (content.length === 0) {
    throw new Error(`Uploaded resume file is empty for userId ${userId}`);
  }
  return content;
}

/** @param {string} userId */
async function loadContactProfile(userId) {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const configPath = path.join(process.cwd(), 'src/bots/user-bots-config.json');
    if (!fs.existsSync(configPath)) return null;

    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    const formData = parsed?.formData || {};
    const contactProfile = {
      full_name: String(formData.fullName || '').trim(),
      email: String(formData.email || userId || '').trim(),
      phone: String(formData.phone || '').trim(),
      linkedin_url: String(formData.linkedinUrl || '').trim(),
      resume_file_name: String(formData.resumeFileName || '').trim()
    };

    if (!contactProfile.full_name && !contactProfile.email && !contactProfile.phone && !contactProfile.linkedin_url) {
      return null;
    }
    return contactProfile;
  } catch {
    return null;
  }
}

export async function POST({ request }) {
  try {
    const body = await request.json();

    // Extract data from request
    const { jobDescription, userId, jobId } = body;

    // Get auth token from request header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    if (!jobDescription) {
      return json({
        success: false,
        error: 'Job description is required'
      }, { status: 400 });
    }

    // Strict mode: only use uploaded resume associated with this user.
    const contactProfile = await loadContactProfile(userId);
    const resumeText = await loadResumeFromUploads(
      userId,
      authHeader,
      contactProfile?.resume_file_name || ''
    );

    // Generate a job_id if not provided (required by corpus-rag API)
    const generatedJobId = jobId || `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Prepare request for corpus-rag API
    const requestBody = {
      job_id: generatedJobId,  // Required field
      job_details: jobDescription,
      resume_text: resumeText,
      useAi: "deepseek-chat",
      platform: "manual",
      job_title: "",
      company: "",
      strictQuality: true,
      qualityThreshold: 92,
      strictQualityRetries: 1,
      contact_profile: contactProfile,
      prompt: `Write a compelling, professional cover letter for this job posting.
Highlight relevant experience and skills that match the job requirements.
Keep it concise (300-400 words) and personalized.
Focus on demonstrating value and enthusiasm for the role.`
    };

    console.log('🔄 Calling corpus-rag API for cover letter generation...');

    // Call corpus-rag API with authentication
    const response = await fetch(`${API_BASE}/api/cover_letter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader  // Forward auth token
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Corpus-rag API error:', data);
      return json({
        success: false,
        error: data.error || 'Failed to generate cover letter'
      }, { status: response.status });
    }

    if (data.cover_letter) {
      console.log('✅ Cover letter generated successfully');
      return json({
        success: true,
        coverLetter: data.cover_letter,
        metadata: {
          provider: 'deepseek-chat',
          timestamp: new Date().toISOString(),
          qualityScore: data.qualityScore,
          qualityControl: data.qualityControl,
          contactProfileUsed: data.contactProfileUsed,
          warning: data.warning
        }
      });
    } else {
      return json({
        success: false,
        error: 'No cover letter returned from API'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('❌ Cover letter generation error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return json({
      success: false,
      error: message || 'Internal server error'
    }, { status: 500 });
  }
}
