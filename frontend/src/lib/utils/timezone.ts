/**
 * Strict timezone utilities for Project Rina.
 * All date formatting goes through here to override browser timezone bugs.
 */

import { currentUser } from '$lib/stores/auth.svelte';

// Default timezones for the two users if DB value is missing
const DEFAULT_TIMEZONES: Record<string, string> = {
  maroon: 'Africa/Casablanca',
  rina: 'Asia/Yekaterinburg'
};

export function getUserTimezone(): string {
  const user = currentUser();
  if (user?.timezone && user.timezone !== 'UTC') {
    return user.timezone;
  }
  return DEFAULT_TIMEZONES[user?.username || ''] || 'UTC';
}

export function getPartnerTimezone(): string {
  const user = currentUser();
  const partnerUsername = user?.username === 'maroon' ? 'rina' : 'maroon';
  return DEFAULT_TIMEZONES[partnerUsername] || 'UTC';
}

/**
 * Format a date as a time string in the given timezone.
 */
export function formatTime(date: Date | string, timezone?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-GB', {
    timeZone: timezone || getUserTimezone(),
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format a date as a date string in the given timezone.
 */
export function formatDate(date: Date | string, timezone?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-GB', {
    timeZone: timezone || getUserTimezone(),
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
}

/**
 * Format a date as a full datetime string in the given timezone.
 */
export function formatDateTime(date: Date | string, timezone?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-GB', {
    timeZone: timezone || getUserTimezone(),
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Get the UTC offset label for a timezone (e.g. "GMT+5").
 */
export function getOffsetLabel(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      timeZoneName: 'shortOffset'
    });
    const parts = formatter.formatToParts(now);
    const offset = parts.find((p) => p.type === 'timeZoneName');
    return offset?.value || timezone;
  } catch {
    return timezone;
  }
}

/**
 * Convert a datetime-local string (YYYY-MM-DDTHH:MM) to a full ISO 8601 UTC string.
 * This is required because Zod's .datetime() expects ISO 8601 with offset/Z.
 */
export function datetimeLocalToIso(value: string): string {
  if (!value) return '';
  // datetime-local gives "2024-06-15T14:30" — treat as user's local timezone
  const tz = getUserTimezone();
  // Append seconds so it's a valid ISO-like string, then parse
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  // Use the timezone to compute the correct UTC time
  const date = new Date(withSeconds);
  // If the browser interpreted it as local, we need to adjust.
  // A robust approach: construct the date explicitly in the target timezone
  const match = withSeconds.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return new Date(withSeconds).toISOString();

  const [, y, mo, d, h, mi, s] = match.map(Number);
  // Create a date string that Intl can parse in the target timezone
  const temp = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  // Get timezone offset in minutes
  const tzDateStr = temp.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'short' });
  // Parse the offset from the timezone name (not reliable across browsers)
  // Better: use a two-step comparison
  const utcTime = Date.UTC(y, mo - 1, d, h, mi, s);
  const tzTime = new Date(utcTime).toLocaleString('en-US', { timeZone: tz, hour12: false });
  const tzMatch = tzTime.match(/(\d+)\/(\d+)\/(\d+), (\d+):(\d+):(\d+)/);
  if (!tzMatch) return new Date(utcTime).toISOString();

  const [, tm, td, ty, th, tmi, ts] = tzMatch.map(Number);
  const tzDate = new Date(ty, tm - 1, td, th, tmi, ts);
  const offsetMs = tzDate.getTime() - utcTime;
  const correctUtc = utcTime - offsetMs;
  return new Date(correctUtc).toISOString();
}

/**
 * Convert an ISO string to a datetime-local string (YYYY-MM-DDTHH:MM)
 * in the user's timezone.
 */
export function isoToDatetimeLocal(isoString: string): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  const tz = getUserTimezone();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(d);

  const y = parts.find((p) => p.type === 'year')?.value;
  const mo = parts.find((p) => p.type === 'month')?.value;
  const da = parts.find((p) => p.type === 'day')?.value;
  const h = parts.find((p) => p.type === 'hour')?.value;
  const mi = parts.find((p) => p.type === 'minute')?.value;

  return `${y}-${mo}-${da}T${h}:${mi}`;
}

/**
 * Check if a capsule is locked, using strict UTC comparison.
 * Both server and client use UTC for consistency.
 */
export function isLocked(unlockAt: string | Date): boolean {
  const unlock = typeof unlockAt === 'string' ? new Date(unlockAt) : unlockAt;
  return Date.now() < unlock.getTime();
}

/**
 * Time remaining until unlock, formatted as "Xd Xh remaining".
 */
export function timeUntil(unlockAt: string | Date): string {
  const unlock = typeof unlockAt === 'string' ? new Date(unlockAt) : unlockAt;
  const diff = unlock.getTime() - Date.now();
  if (diff <= 0) return 'Unlocked!';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  return `${days}d ${hours}h remaining`;
}
