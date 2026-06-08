import type { ClientInit, HandleClientError } from '@sveltejs/kit';

// Client hooks run before the app mounts.
// Auth initialization is handled in +layout.svelte to avoid double API calls.

export const init: ClientInit = async () => {
  // Intentionally empty — auth init is in +layout.svelte
};

export const handleError: HandleClientError = ({ error }) => {
  console.error(error);
};
