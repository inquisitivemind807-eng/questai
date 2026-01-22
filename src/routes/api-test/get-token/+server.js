import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const CORPUS_RAG_API = env.API_BASE || process.env.API_BASE || 'http://localhost:3000';

export async function POST({ request }) {
	try {
		const { corpusToken } = await request.json();

		if (!corpusToken) {
			return json({
				success: false,
				error: 'No corpus-rag token provided'
			}, { status: 400 });
		}

		// Verify token with corpus-rag
		const response = await fetch(`${CORPUS_RAG_API}/api/auth/token`, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${corpusToken}`
			}
		});

		const data = await response.json();

		if (!response.ok) {
			return json({
				success: false,
				error: data.error || 'Invalid token'
			}, { status: response.status });
		}

		// Token is valid, return it
		return json({
			success: true,
			token: data.token,
			user: data.user
		});

	} catch (error) {
		console.error('Verify token error:', error);
		return json({
			success: false,
			error: error.message
		}, { status: 500 });
	}
}
