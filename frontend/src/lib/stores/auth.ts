import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { authApi, type AuthUser } from '$lib/utils/api';

// ─── Types ───────────────────────────────────────────────────────
interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
}

// ─── Initial State ───────────────────────────────────────────────
function createInitialState(): AuthState {
  return {
    user: null,
    loading: browser, // Only loading on client during hydration
    error: null
  };
}

// ─── Store ───────────────────────────────────────────────────────
function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>(createInitialState());

  return {
    subscribe,

    // Initialize auth from server or token
    async init() {
      if (!browser) return;

      update(s => ({ ...s, loading: true, error: null }));
      try {
        const { user } = await authApi.me();
        update(s => ({ ...s, user, loading: false }));
      } catch {
        update(s => ({ ...s, user: null, loading: false }));
      }
    },

    // Login action
    async login(username: string, password: string) {
      update(s => ({ ...s, loading: true, error: null }));
      try {
        const { user } = await authApi.login({ username, password });
        update(s => ({ ...s, user, loading: false, error: null }));
        return user;
      } catch (err: unknown) {
        const message = (err as { message?: string }).message || 'Login failed';
        update(s => ({ ...s, user: null, loading: false, error: message }));
        throw err;
      }
    },

    // Logout action
    async logout() {
      try {
        await authApi.logout();
      } catch {
        // Ignore logout errors
      }
      set({ user: null, loading: false, error: null });
      goto('/login');
    },

    // Clear error
    clearError() {
      update(s => ({ ...s, error: null }));
    },

    // Set user directly (e.g. from SSR)
    setUser(user: AuthUser | null) {
      update(s => ({ ...s, user, loading: false }));
    }
  };
}

export const auth = createAuthStore();

// ─── Derived Stores ──────────────────────────────────────────────
export const isAuthenticated = derived(auth, $auth => !!$auth.user);
export const isLoading = derived(auth, $auth => $auth.loading);
export const currentUser = derived(auth, $auth => $auth.user);

// ─── Reactive Partner Detection ──────────────────────────────────
export const partnerName = derived(currentUser, $user => {
  if (!$user) return null;
  return $user.username === 'maroon' ? 'Rina' : 'MarOOn';
});
