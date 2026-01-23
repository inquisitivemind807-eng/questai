import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const API_BASE = env.API_BASE || process.env.API_BASE || 'http://localhost:3000';

export async function POST({ request }) {
  try {
    const body = await request.json();

    // Extract data from request
    const { jobDescription, userId, enhancementFocus = 'general', resumeText: providedResumeText } = body;

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

    // Use provided resume text or read from default location
    let resumeText = providedResumeText;
    
    if (!resumeText) {
      // Read resume from default location
      const fs = await import('fs');
      const path = await import('path');
      const resumePath = path.join(process.cwd(), 'src/bots/all-resumes/software_engineer.txt');
      resumeText = fs.existsSync(resumePath)
        ? fs.readFileSync(resumePath, 'utf8')
        : "Experienced software developer";
    }

    // Generate a job_id if not provided (required by corpus-rag API)
    const jobId = body.jobId || `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Prepare request for corpus-rag API
    const requestBody = {
      job_id: jobId,
      job_details: jobDescription,
      resume_text: resumeText,
      useAi: "deepseek-chat",
      platform: "manual",
      job_title: "",
      company: "",
      prompt: `You are an expert resume enhancement specialist. I will provide you with my current resume and a job description.

Your task: Enhance my resume to maximize fit for this specific job.

Instructions:
1. Calculate ORIGINAL FIT SCORE (0-100%) based on current resume match
2. Enhance the resume with focus on: ${enhancementFocus}
3. Calculate ENHANCED FIT SCORE (0-100%) after improvements
4. Provide the complete ENHANCED RESUME text

Enhancement Focus Areas:
- ATS Optimization: Keywords, formatting, ATS-friendly structure
- Skills Matching: Highlight relevant technical and soft skills
- Keyword Enhancement: Industry terminology and buzzwords
- Experience Boost: Quantify achievements, action verbs, impact
- General: Overall professional presentation

Format your response clearly showing:
- Original Fit Score: XX%
- Enhanced Fit Score: XX%
- [Then provide the complete enhanced resume text]`
    };

    console.log('🔄 Calling corpus-rag API for resume enhancement...');

    // Call corpus-rag API with authentication
    const response = await fetch(`${API_BASE}/api/resume`, {
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
        error: data.error || 'Failed to enhance resume'
      }, { status: response.status });
    }

    if (data.resume) {
      console.log('✅ Resume enhanced successfully');

      // Parse fit scores from the response
      const enhancedResumeText = data.resume;
      const originalFitMatch = enhancedResumeText.match(/Original Fit Score:\s*(\d+)%/i);
      const enhancedFitMatch = enhancedResumeText.match(/Enhanced Fit Score:\s*(\d+)%/i);

      return json({
        success: true,
        enhancedResume: enhancedResumeText,
        originalFitScore: originalFitMatch ? parseInt(originalFitMatch[1]) : null,
        enhancedFitScore: enhancedFitMatch ? parseInt(enhancedFitMatch[1]) : null,
        metadata: {
          provider: 'deepseek-chat',
          focus: enhancementFocus,
          timestamp: new Date().toISOString()
        }
      });
    } else {
      return json({
        success: false,
        error: 'No resume returned from API'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('❌ Resume enhancement error:', error);
    return json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}
