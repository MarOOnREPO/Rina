import { browser } from '$app/environment';

const API_BASE = browser ? '' : 'http://localhost:3000';

export interface ApiError {
  message: string;
  code?: string;
  status: number;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl = `${API_BASE}/api`) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...((body && !(body instanceof FormData))
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(options?.headers as Record<string, string> || {})
    };

    const response = await fetch(url, {
      method,
      headers,
      credentials: 'include',
      ...(body && { body: body instanceof FormData ? body : JSON.stringify(body) }),
      ...options
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error: ApiError = {
        message: errorData.error || `HTTP ${response.status}`,
        code: errorData.code,
        status: response.status
      };
      throw error;
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  get<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  post<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  put<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>('PUT', path, body, options);
  }

  patch<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>('PATCH', path, body, options);
  }

  delete<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }
}

export const api = new ApiClient();

// ─── Typed Auth API ──────────────────────────────────────────────
export interface AuthUser {
  username: string;
  displayName: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export const authApi = {
  login: (credentials: LoginCredentials) =>
    api.post<{ user: AuthUser }>('/auth/login', credentials),

  logout: () => api.post<void>('/auth/logout'),

  me: () => api.get<{ user: AuthUser }>('/auth/me')
};

// ─── Calendar API ────────────────────────────────────────────────
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime?: string;
  type: 'WORK' | 'SHARED';
  creator: string;
  allDay: boolean;
  color?: string;
}

export const calendarApi = {
  list: (from?: string, to?: string) =>
    api.get<CalendarEvent[]>(`/calendar?from=${from || ''}&to=${to || ''}`),
  create: (data: Partial<CalendarEvent>) =>
    api.post<CalendarEvent>('/calendar', data),
  update: (id: string, data: Partial<CalendarEvent>) =>
    api.patch<CalendarEvent>(`/calendar/${id}`, data),
  remove: (id: string) => api.delete<void>(`/calendar/${id}`)
};

// ─── Movie API ───────────────────────────────────────────────────
export interface Movie {
  id: string;
  tmdbId: number;
  title: string;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  releaseDate?: string;
  watched: boolean;
  watchedAt?: string;
  rating?: number;
}

export const movieApi = {
  list: () => api.get<Movie[]>('/movies'),
  searchTmdb: (query: string) =>
    api.get<Array<{ tmdbId: number; title: string; posterPath?: string; releaseDate?: string }>>(
      `/movies/search?t=${encodeURIComponent(query)}`
    ),
  add: (tmdbId: number) => api.post<Movie>('/movies', { tmdbId }),
  toggleWatched: (id: string) => api.patch<Movie>(`/movies/${id}/watched`),
  rate: (id: string, rating: number) => api.patch<Movie>(`/movies/${id}/rate`, { rating }),
  remove: (id: string) => api.delete<void>(`/movies/${id}`)
};

// ─── Message API ─────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  senderId: string;
  content: string;
  type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO';
  mediaUrl?: string;
  replyToId?: string;
  editedAt?: string;
  createdAt: string;
}

export const messageApi = {
  history: (before?: string, limit = 50) =>
    api.get<ChatMessage[]>(`/messages?limit=${limit}${before ? `&before=${before}` : ''}`),
  send: (content: string, type?: ChatMessage['type']) =>
    api.post<ChatMessage>('/messages', { content, type: type || 'TEXT' })
};

// ─── Time Capsule API ────────────────────────────────────────────
export interface TimeCapsule {
  id: string;
  title: string;
  description?: string;
  mediaType: 'audio' | 'video' | 'text';
  unlockAt: string;
  creatorId: string;
  openedAt?: string;
  createdAt: string;
}

export const capsuleApi = {
  list: () => api.get<TimeCapsule[]>('/capsules'),
  create: (data: Partial<TimeCapsule> & { encryptedData: string }) =>
    api.post<TimeCapsule>('/capsules', data),
  unlock: (id: string) => api.get<{ data: string; decrypted: boolean }>(`/capsules/${id}/unlock`),
  remove: (id: string) => api.delete<void>(`/capsules/${id}`)
};

// ─── Scrapbook API ───────────────────────────────────────────────
export interface ScrapbookPhoto {
  id: string;
  url: string;
  thumbnailUrl?: string;
  lat?: number;
  lng?: number;
  caption?: string;
  takenAt?: string;
  uploadedBy: string;
  createdAt: string;
}

export const scrapbookApi = {
  list: () => api.get<ScrapbookPhoto[]>('/scrapbook'),
  upload: (formData: FormData) =>
    api.post<ScrapbookPhoto>('/scrapbook', formData, {
      headers: {} // Let browser set Content-Type with boundary
    }),
  remove: (id: string) => api.delete<void>(`/scrapbook/${id}`)
};

// ─── Goal API ────────────────────────────────────────────────────
export interface Goal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  deadline?: string;
  icon?: string;
  createdBy: string;
  createdAt: string;
}

export const goalApi = {
  list: () => api.get<Goal[]>('/goals'),
  create: (data: Partial<Goal>) => api.post<Goal>('/goals', data),
  contribute: (id: string, amount: number) =>
    api.patch<Goal>(`/goals/${id}/contribute`, { amount }),
  remove: (id: string) => api.delete<void>(`/goals/${id}`)
};

// ─── Countdown API ───────────────────────────────────────────────
export interface Countdown {
  id: string;
  title: string;
  targetDate: string;
  location?: string;
  imageUrl?: string;
  createdAt: string;
}

export const countdownApi = {
  list: () => api.get<Countdown[]>('/countdowns'),
  create: (data: Partial<Countdown>) => api.post<Countdown>('/countdowns', data),
  remove: (id: string) => api.delete<void>(`/countdowns/${id}`)
};
