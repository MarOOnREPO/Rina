import { prisma } from './prisma.js';
import { encrypt, decrypt } from './encryption.js';

const SPOTIFY_API = 'https://api.spotify.com/v1';

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export async function getSpotifyToken(userId: string): Promise<SpotifyTokens | null> {
  const token = await prisma.spotifyToken.findUnique({ where: { userId } });
  if (!token) return null;
  const accessToken = decrypt(token.accessToken);
  const refreshToken = decrypt(token.refreshToken);
  if (token.expiresAt < new Date(Date.now() + 60000)) {
    return refreshSpotifyToken(refreshToken, userId);
  }
  return {
    accessToken,
    refreshToken,
    expiresAt: token.expiresAt
  };
}

export async function refreshSpotifyToken(
  refreshToken: string,
  userId: string
): Promise<SpotifyTokens | null> {
  // PKCE refresh does NOT require client_secret
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  if (!res.ok) return null;
  const data = (await res.json()) as any;

  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  const newAccessToken = encrypt(data.access_token);
  const newRefreshToken = encrypt(data.refresh_token || refreshToken);
  await prisma.spotifyToken.upsert({
    where: { userId },
    update: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt
    },
    create: {
      userId,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt
    }
  });

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt
  };
}

export async function spotifyApiRequest(
  endpoint: string,
  options: RequestInit,
  userId: string
): Promise<{ success: boolean; data?: any; error?: string; status: number }> {
  const tokens = await getSpotifyToken(userId);
  if (!tokens) return { success: false, status: 401, error: 'Spotify not connected' };

  const url = endpoint.startsWith('http') ? endpoint : `${SPOTIFY_API}${endpoint}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (res.status === 401) {
    const refreshed = await refreshSpotifyToken(tokens.refreshToken, userId);
    if (!refreshed) return { success: false, status: 401, error: 'Spotify token expired' };
    const retry = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${refreshed.accessToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const retryData = retry.status !== 204 ? await retry.json().catch(() => null) as any : null;
    return {
      success: retry.ok,
      status: retry.status,
      data: retryData,
      error: retry.ok ? undefined : retryData?.error?.message || 'Spotify request failed'
    };
  }

  const data = res.status !== 204 ? (await res.json().catch(() => null)) as any : null;
  return {
    success: res.ok,
    status: res.status,
    data,
    error: res.ok ? undefined : data?.error?.message || 'Spotify request failed'
  };
}
