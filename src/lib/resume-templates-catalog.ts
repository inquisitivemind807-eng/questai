import type { HybridTemplate } from '$lib/data/resumeTemplates';

export function getResumeTemplatesApiBase(): string {
	return String(
		import.meta.env.VITE_PUBLIC_API_BASE ||
			import.meta.env.VITE_API_BASE ||
			'http://localhost:3000'
	).replace(/\/$/, '');
}

/** Parse filename from Content-Disposition (RFC 5987 filename* and filename=). */
export function filenameFromContentDisposition(header: string | null): string | null {
	if (!header) return null;
	const star = /filename\*=(?:UTF-8''|utf-8'')([^;\s]+)/i.exec(header);
	if (star?.[1]) {
		try {
			return decodeURIComponent(star[1].replace(/^"|"$/g, ''));
		} catch {
			return star[1];
		}
	}
	const quoted = /filename="((?:\\.|[^"\\])*)"/i.exec(header);
	if (quoted?.[1]) return quoted[1].replace(/\\"/g, '"');
	const plain = /filename=([^;\s]+)/i.exec(header);
	if (plain?.[1]) return plain[1].replace(/^"|"$/g, '');
	return null;
}

export function resolveDownloadFilename(response: Response, downloadUrl: string): string {
	const fromHeader = filenameFromContentDisposition(response.headers.get('Content-Disposition'));
	if (fromHeader) return fromHeader;
	try {
		const path = new URL(downloadUrl).pathname;
		const last = path.split('/').filter(Boolean).pop();
		if (last && last.toLowerCase() !== 'download') {
			return decodeURIComponent(last);
		}
	} catch {
		/* ignore */
	}
	return 'resume.docx';
}

/** Browser-only: fetch blob and trigger save using Content-Disposition when available. */
export async function downloadDocxFromUrl(downloadUrl: string): Promise<void> {
	const response = await fetch(downloadUrl, { cache: 'no-store' });
	if (!response.ok) throw new Error('Failed to fetch file');
	const blob = await response.blob();
	const objectUrl = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.style.display = 'none';
	a.href = objectUrl;
	a.download = resolveDownloadFilename(response, downloadUrl);
	document.body.appendChild(a);
	a.click();
	URL.revokeObjectURL(objectUrl);
	document.body.removeChild(a);
}

function isPublicCatalogRow(
	r: unknown
): r is {
	id: string;
	title: string;
	category: string;
	file_url: string;
	description?: string;
	preview_url?: string;
	preview_urls?: string[];
	status?: string;
} {
	if (!r || typeof r !== 'object') return false;
	const o = r as Record<string, unknown>;
	return (
		typeof o.id === 'string' &&
		typeof o.file_url === 'string' &&
		typeof o.title === 'string' &&
		typeof o.category === 'string'
	);
}

function mapPublicRow(
	row: {
		id: string;
		title: string;
		category: string;
		file_url: string;
		description?: string;
		preview_url?: string;
		preview_urls?: string[];
		status?: string;
	},
	apiBase: string
): HybridTemplate {
	const downloadPath = row.file_url.startsWith('/') ? row.file_url : `/${row.file_url}`;
	const previewPath = row.preview_url
		? row.preview_url.startsWith('/')
			? row.preview_url
			: `/${row.preview_url}`
		: undefined;
	return {
		id: row.id,
		title: row.title,
		description: row.description,
		category: row.category,
		downloadUrl: new URL(downloadPath, `${apiBase}/`).href,
		previewUrl: previewPath ? new URL(previewPath, `${apiBase}/`).href : undefined,
		previewUrls: row.preview_urls?.map((p) => new URL(p.startsWith('/') ? p : `/${p}`, `${apiBase}/`).href)
	};
}

/**
 * Fetches resume templates from corpus-rag (public JSON array).
 * Admin `{ success, data }` responses are ignored on this app (defensive).
 */
export async function loadResumeTemplatesCatalog(): Promise<HybridTemplate[]> {
	const apiBase = getResumeTemplatesApiBase();
	const res = await fetch(`${apiBase}/api/resume-templates`, { cache: 'no-store' });
	const text = await res.text();
	let body: unknown = null;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		body = null;
	}

	if (!res.ok) {
		const msg =
			body &&
			typeof body === 'object' &&
			'error' in body &&
			typeof (body as { error: unknown }).error === 'string'
				? (body as { error: string }).error
				: `Could not load templates (${res.status})`;
		throw new Error(msg);
	}

	if (Array.isArray(body)) {
		return body
			.filter(isPublicCatalogRow)
			.filter((r) => r.status === undefined || r.status === 'Enabled')
			.map((r) => mapPublicRow(r, apiBase));
	}

	if (
		body !== null &&
		typeof body === 'object' &&
		'success' in body &&
		(body as { success?: boolean }).success === true &&
		Array.isArray((body as { data?: unknown }).data)
	) {
		return [];
	}

	return [];
}

