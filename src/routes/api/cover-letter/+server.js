import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const API_BASE = env.API_BASE || process.env.API_BASE || 'http://localhost:3000';

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

    // Read resume from default location
    const fs = await import('fs');
    const path = await import('path');
    const resumePath = path.join(process.cwd(), 'src/bots/all-resumes/software_engineer.txt');
    const resumeText = fs.existsSync(resumePath)
      ? fs.readFileSync(resumePath, 'utf8')
      : "Experienced software developer";

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
          timestamp: new Date().toISOString()
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
    return json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}
