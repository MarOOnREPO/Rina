import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { authApi, type AuthUser, type PartnerInfo } from '$lib/utils/api';

// ─── Types ───────────────────────────────────────────────────────
interface AuthState {
  user: (AuthUser & { partner?: PartnerInfo | null }) | null;
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
      const { user, partner } = await authApi.me();
      state.user = { ...user, partner };
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
      const { user, partner } = await authApi.login({ username, password });
      state.user = { ...user, partner };
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
  },

  async updateMe(data: Partial<AuthUser>) {
    try {
      await authApi.updateMe(data);
      if (state.user) {
        state.user = { ...state.user, ...data };
      }
    } catch (err) {
      throw err;
    }
  }
};

// ─── Derived Signals ─────────────────────────────────────────────
// Exported as functions because Svelte 5 does not allow exporting $derived
// directly from .svelte.ts modules. Calling these in templates is fully reactive.
export const isAuthenticated = () => !!state.user;
export const isLoading = () => state.loading;
export const currentUser = () => state.user;

export const partnerName = () => {
  if (!state.user) return null;
  return state.user.partner?.displayName || (state.user.username === 'maroon' ? 'Rina' : 'MarOOn');
};
