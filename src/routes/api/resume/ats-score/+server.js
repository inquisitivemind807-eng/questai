import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const API_BASE = env.API_BASE || process.env.API_BASE || 'http://localhost:3000';

export async function POST({ request }) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { resume_text, job_desc } = body;

    if (!resume_text || !job_desc) {
      return json(
        { success: false, error: 'Missing required fields: resume_text and job_desc are required' },
        { status: 400 }
      );
    }

    const response = await fetch(`${API_BASE}/api/resume/ats-score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader
      },
      body: JSON.stringify({ resume_text, job_desc })
    });

    let data;
    try {
      data = await response.json();
    } catch (_) {
      return json(
        { success: false, error: `Corpus-rag returned ${response.status}. Ensure corpus-rag is running at ${API_BASE}.` },
        { status: response.status >= 400 ? response.status : 502 }
      );
    }

    if (!response.ok) {
      return json(
        { success: false, error: data?.error || `Request failed (${response.status})` },
        { status: response.status }
      );
    }

    return json(data);
  } catch (error) {
    console.error('ATS score proxy error:', error);
    const message = error instanceof Error ? error.message : String(error);
    const isConnectionError = /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(message);
    return json(
      {
        success: false,
        error: isConnectionError
          ? `Cannot connect to corpus-rag at ${API_BASE}. Is it running?`
          : (message || 'Internal server error')
      },
      { status: 500 }
    );
  }
}
