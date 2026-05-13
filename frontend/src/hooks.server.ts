import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // Forward cookies for SSR auth if needed
  const response = await resolve(event);
  return response;
};
