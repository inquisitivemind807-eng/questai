import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const CORPUS_RAG_API = env.API_BASE || process.env.API_BASE || 'http://localhost:3000';

export async function POST({ request }) {
	try {
		const body = await request.json();

		const response = await fetch(`${CORPUS_RAG_API}/api/questionAndAnswers`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		});

		const data = await response.json();

		if (!response.ok) {
			return json(data, { status: response.status });
		}

		return json(data);
	} catch (error) {
		console.error('Proxy error:', error);
		return json({ error: error.message }, { status: 500 });
	}
}
