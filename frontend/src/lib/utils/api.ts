import { browser } from '$app/environment';

const API_BASE = browser ? '' : (process.env.INTERNAL_API_URL || 'http://localhost:8080');

export class ApiError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
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
      ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
      ...options
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message =
        typeof errorData.error === 'string'
          ? errorData.error
          : typeof errorData.message === 'string'
            ? errorData.message
            : `HTTP ${response.status}`;
      throw new ApiError(message, response.status, errorData.code);
    }

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
  id: string;
  username: string;
  displayName: string;
  timezone: string;
  avatarUrl?: string;
}

export interface PartnerInfo {
  id: string;
  username: string;
  displayName: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export const authApi = {
  login: (credentials: LoginCredentials) =>
    api.post<{ user: AuthUser; partner?: PartnerInfo | null }>('/auth/login', credentials),
  logout: () => api.post<void>('/auth/logout'),
  me: () => api.get<{ user: AuthUser; partner?: PartnerInfo | null }>('/auth/me'),
  notifications: () => api.get<{ notifications: AppNotification[] }>('/auth/notifications'),
  markRead: () => api.post<void>('/auth/notifications/read'),
  updateMe: (data: Partial<AuthUser>) => api.patch<void>('/auth/me', data)
};

// ─── Calendar API ────────────────────────────────────────────────
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime?: string;
  type: 'WORK' | 'SHARED' | 'PERSONAL';
  creatorId: string;
  allDay: boolean;
  color?: string;
}

export const calendarApi = {
  list: (from?: string, to?: string) =>
    api.get<CalendarEvent[]>(`/calendar?from=${from || ''}&to=${to || ''}`),
  create: (data: Partial<CalendarEvent>) => api.post<CalendarEvent>('/calendar', data),
  update: (id: string, data: Partial<CalendarEvent>) => api.patch<CalendarEvent>(`/calendar/${id}`, data),
  remove: (id: string) => api.delete<void>(`/calendar/${id}`)
};

// ─── Cycle Tracker API ───────────────────────────────────────────
export interface CycleEntry {
  id: string;
  userId: string;
  date: string;
  flowIntensity?: number;
  symptoms: string[];
  temperature?: number;
  notes?: string;
  createdAt: string;
}

export const cycleApi = {
  list: (from?: string, to?: string) =>
    api.get<CycleEntry[]>(`/cycle?from=${from || ''}&to=${to || ''}`),
  create: (data: Partial<CycleEntry> & { date: string }) => api.post<CycleEntry>('/cycle', data),
  update: (id: string, data: Partial<CycleEntry>) => api.patch<CycleEntry>(`/cycle/${id}`, data),
  remove: (id: string) => api.delete<void>(`/cycle/${id}`)
};

// ─── Movie API ───────────────────────────────────────────────────
export interface Genre {
  id: number;
  name: string;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profilePath?: string;
  order: number;
}

export interface Movie {
  id: string;
  title: string;
  posterPath?: string;
  backdropPath?: string;
  trailerUrl?: string;
  filePath?: string;
  uploadedBy: string;
  createdAt: string;
  // TMDB & watchlist
  tmdbId?: number;
  overview?: string;
  releaseDate?: string;
  runtime?: number;
  voteAverage?: number;
  genres?: Genre[];
  cast?: CastMember[];
  director?: string;
  sourceType: 'uploaded' | 'watchlist';
  watched: boolean;
  watchedAt?: string;
  rating?: number;
}

export const movieApi = {
  list: (source?: 'uploaded' | 'watchlist' | 'all') =>
    api.get<Movie[]>(`/movies${source && source !== 'all' ? `?source=${source}` : ''}`),
  get: (id: string) => api.get<Movie>(`/movies/${id}`),
  create: (formData: FormData) => api.post<Movie>('/movies', formData, { headers: {} }),
  update: (id: string, body: Partial<Movie>) => api.patch<Movie>(`/movies/${id}`, body),
  addToWatchlist: (tmdbId: number) => api.post<Movie>('/movies/watchlist', { tmdbId }),
  remove: (id: string) => api.delete<void>(`/movies/${id}`),
  download: (id: string) => `${API_BASE}/api/movies/${id}/download`,
  watch: (id: string) => `${API_BASE}/api/movies/${id}/watch`
};

// ─── TMDB API ────────────────────────────────────────────────────
export interface TMDBMovieResult {
  id: number;
  title: string;
  overview: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date: string;
  vote_average: number;
  genre_ids: number[];
}

export interface TMDBSearchResponse {
  page: number;
  results: TMDBMovieResult[];
  total_pages: number;
  total_results: number;
}

export interface TMDBDiscoverResponse {
  page: number;
  results: TMDBMovieResult[];
  total_pages: number;
  total_results: number;
}

export interface TMDBVideo {
  key: string;
  site: string;
  type: string;
}

export interface TMDBMovieDetail {
  id: number;
  title: string;
  tagline: string;
  overview: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date: string;
  runtime: number;
  vote_average: number;
  genres: Genre[];
  credits?: {
    cast: Array<{
      id: number;
      name: string;
      character: string;
      profile_path?: string;
      order: number;
    }>;
    crew: Array<{ id: number; name: string; job: string; profile_path?: string }>;
  };
  videos?: {
    results: TMDBVideo[];
  };
}

export const tmdbApi = {
  search: (q: string, page = 1) =>
    api.get<TMDBSearchResponse>(`/tmdb/search?q=${encodeURIComponent(q)}&page=${page}`),
  discover: (category: string, page = 1) =>
    api.get<TMDBDiscoverResponse>(`/tmdb/discover?category=${category}&page=${page}`),
  getMovie: (tmdbId: number) =>
    api.get<TMDBMovieDetail>(`/tmdb/movie/${tmdbId}`),
  getCredits: (tmdbId: number) =>
    api.get<{ cast: Array<{ id: number; name: string; character: string; profile_path?: string; order: number }>; crew: Array<{ id: number; name: string; job: string; profile_path?: string }> }>(`/tmdb/movie/${tmdbId}/credits`),
  getGenres: () =>
    api.get<{ genres: Genre[] }>('/tmdb/genres')
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
  send: (content: string, type?: ChatMessage['type'], replyToId?: string) =>
    api.post<ChatMessage>('/messages', { content, type: type || 'TEXT', replyToId }),
  edit: (id: string, content: string) => api.patch<ChatMessage>(`/messages/${id}`, { content }),
  remove: (id: string) => api.delete<void>(`/messages/${id}`)
};

// ─── YouTube API ─────────────────────────────────────────────────
export const youtubeApi = {
  search: (q: string) =>
    api.get<Array<{ videoId: string; title: string; description: string; thumbnail: string }>>(`/youtube/search?q=${encodeURIComponent(q)}`)
};

// ─── Push API ────────────────────────────────────────────────────
export const pushApi = {
  subscribe: (sub: { endpoint: string; p256dh: string; auth: string }) =>
    api.post<void>('/push/subscribe', sub),
  unsubscribe: (sub: { endpoint: string }) =>
    api.post<void>('/push/unsubscribe', sub),
  notify: (payload: { title: string; body: string }) =>
    api.post<void>('/push/notify', payload),
  vapidPublicKey: () => api.get<{ publicKey: string }>('/push/vapid-public')
};

// ─── RTC API ─────────────────────────────────────────────────────
export const rtcApi = {
  iceServers: () => api.get<{ iceServers: Array<{ urls: string[]; username?: string; credential?: string }> }>('/rtc/ice-servers')
};

// ─── Admin Config API ────────────────────────────────────────────
export const adminConfigApi = {
  list: () => api.get<Array<{ id: string; key: string; value: string; updatedAt: string; updatedBy?: string }>>('/admin/config'),
  public: () => api.get<Record<string, unknown>>('/admin/config/public'),
  update: (key: string, value: string) => api.put<void>(`/admin/config/${key}`, { value })
};

// ─── Notification Types ──────────────────────────────────────────
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: unknown;
  read: boolean;
  createdAt: string;
}
