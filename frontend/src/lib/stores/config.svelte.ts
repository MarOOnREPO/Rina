import { browser } from '$app/environment';

export interface AppConfig {
  features: {
    youtube: boolean;
    push: boolean;
    uploads: boolean;
    cinema: boolean;
    tmdb: boolean;
    backup: boolean;
    mapbox: boolean;
  };
  domain: string;
  frontendUrl: string;
  vapidPublicKey: string | null;

  mapboxToken: string | null;
}

let config = $state<AppConfig | null>(null);
let loading = $state(true);

export async function loadConfig() {
  if (!browser) return;
  try {
    const res = await fetch('/api/config');
    if (res.ok) config = await res.json();
  } catch {
    /* ignore */
  } finally {
    loading = false;
  }
}

export function getConfig() {
  return config;
}

export function isFeatureEnabled(name: keyof AppConfig['features']) {
  return config?.features?.[name] ?? false;
}

export function isConfigLoading() {
  return loading;
}
