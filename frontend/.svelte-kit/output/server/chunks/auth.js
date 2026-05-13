import { i as derived, w as writable } from "./exports.js";
import { B as BROWSER } from "./render-context.js";
import { g as goto } from "./client.js";
const API_BASE = "http://localhost:3000";
class ApiClient {
  baseUrl;
  constructor(baseUrl = `${API_BASE}/api`) {
    this.baseUrl = baseUrl;
  }
  async request(method, path, body, options) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      Accept: "application/json",
      ...body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {},
      ...options?.headers || {}
    };
    const response = await fetch(url, {
      method,
      headers,
      credentials: "include",
      ...body && { body: body instanceof FormData ? body : JSON.stringify(body) },
      ...options
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = {
        message: errorData.error || `HTTP ${response.status}`,
        code: errorData.code,
        status: response.status
      };
      throw error;
    }
    if (response.status === 204) {
      return void 0;
    }
    return response.json();
  }
  get(path, options) {
    return this.request("GET", path, void 0, options);
  }
  post(path, body, options) {
    return this.request("POST", path, body, options);
  }
  put(path, body, options) {
    return this.request("PUT", path, body, options);
  }
  patch(path, body, options) {
    return this.request("PATCH", path, body, options);
  }
  delete(path, options) {
    return this.request("DELETE", path, void 0, options);
  }
}
const api = new ApiClient();
const authApi = {
  login: (credentials) => api.post("/auth/login", credentials),
  logout: () => api.post("/auth/logout"),
  me: () => api.get("/auth/me")
};
function createInitialState() {
  return {
    user: null,
    loading: BROWSER,
    // Only loading on client during hydration
    error: null
  };
}
function createAuthStore() {
  const { subscribe, set, update } = writable(createInitialState());
  return {
    subscribe,
    // Initialize auth from server or token
    async init() {
      return;
    },
    // Login action
    async login(username, password) {
      update((s) => ({ ...s, loading: true, error: null }));
      try {
        const { user } = await authApi.login({ username, password });
        update((s) => ({ ...s, user, loading: false, error: null }));
        return user;
      } catch (err) {
        const message = err.message || "Login failed";
        update((s) => ({ ...s, user: null, loading: false, error: message }));
        throw err;
      }
    },
    // Logout action
    async logout() {
      try {
        await authApi.logout();
      } catch {
      }
      set({ user: null, loading: false, error: null });
      goto();
    },
    // Clear error
    clearError() {
      update((s) => ({ ...s, error: null }));
    },
    // Set user directly (e.g. from SSR)
    setUser(user) {
      update((s) => ({ ...s, user, loading: false }));
    }
  };
}
const auth = createAuthStore();
const isAuthenticated = derived(auth, ($auth) => !!$auth.user);
const isLoading = derived(auth, ($auth) => $auth.loading);
const currentUser = derived(auth, ($auth) => $auth.user);
derived(currentUser, ($user) => {
  if (!$user) return null;
  return $user.username === "maroon" ? "Rina" : "MarOOn";
});
export {
  auth as a,
  isLoading as b,
  currentUser as c,
  isAuthenticated as i
};
//# sourceMappingURL=auth.js.map
