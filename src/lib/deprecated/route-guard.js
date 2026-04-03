import { redirect } from '@sveltejs/kit';

export function requireAuth(session) {
  if (!session?.user) {
    throw redirect(302, '/login');
  }
}

export function redirectIfAuthenticated(session) {
  if (session?.user) {
    throw redirect(302, '/app');
  }
}