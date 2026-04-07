import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/** Legacy URL: editing is not part of this flow; canonical route is `/resume-templates/view/...`. */
export const load = (({ params }) => {
    throw redirect(308, `/resume-templates/view/${params.templateId}`);
}) satisfies PageLoad;
