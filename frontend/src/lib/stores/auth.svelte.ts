import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { authApi, type AuthUser } from '$lib/utils/api';

// ─── Types ───────────────────────────────────────────────────────
interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
}

// ─── Reactive State ──────────────────────────────────────────────
const state = $state<AuthState>({
  user: null,
  loading: browser,
  error: null
});

// ─── Auth Controller ─────────────────────────────────────────────
export const auth = {
  get user() { return state.user; },
  get loading() { return state.loading; },
  get error() { return state.error; },

  async init() {
    if (!browser) return;
    state.loading = true;
    state.error = null;
    try {
      const { user } = await authApi.me();
      state.user = user;
    } catch {
      state.user = null;
    } finally {
      state.loading = false;
    }
  },

  async login(username: string, password: string) {
    state.loading = true;
    state.error = null;
    try {
      const { user } = await authApi.login({ username, password });
      state.user = user;
      state.error = null;
      return user;
    } catch (err: unknown) {
      const message = (err as { message?: string }).message || 'Login failed';
      state.user = null;
      state.error = message;
      throw err;
    } finally {
      state.loading = false;
    }
  },

  async logout() {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout errors
    }
    state.user = null;
    state.loading = false;
    state.error = null;
    goto('/login');
  },

  clearError() {
    state.error = null;
  },

  setUser(user: AuthUser | null) {
    state.user = user;
    state.loading = false;
  }
};

// ─── Derived Signals ─────────────────────────────────────────────
export const isAuthenticated = $derived(!!state.user);
export const isLoading = $derived(state.loading);
export const currentUser = $derived(state.user);

export const partnerName = $derived.by(() => {
  if (!state.user) return null;
  return state.user.username === 'maroon' ? 'Rina' : 'MarOOn';
});
