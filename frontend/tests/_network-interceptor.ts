import { Page } from '@playwright/test';

/**
 * Network Interception Helper for Playwright Tests
 * Blocks heavy/unnecessary resources to speed up tests and reduce flakiness.
 *
 * Usage in a test:
 *   import { blockUnnecessaryResources } from './_network-interceptor';
 *   test.beforeEach(async ({ page }) => {
 *     await blockUnnecessaryResources(page);
 *   });
 */

// Patterns to ABORT (block completely)
const BLOCKED_PATTERNS = [
  // Images (PNG, JPG, WebP, SVG icons, GIFs)
  /\.(png|jpg|jpeg|webp|gif|svg|ico|avif)(\?.*)?$/i,
  // External fonts
  /\.(woff|woff2|ttf|otf|eot)(\?.*)?$/i,
  // Tracking / Analytics
  /google-analytics/,
  /googletagmanager/,
  /analytics\.google/,
  /facebook\.com\/tr/,
  /connect\.facebook/,
  /doubleclick/,
  /googleadservices/,
  /googlesyndication/,
  /hotjar/,
  /segment\./,
  /mixpanel/,
  /amplitude/,
  /sentry/,
  /bugsnag/,
  /newrelic/,
  // Ads / Widgets
  /googleads\.g\.doubleclick/,
  /adsystem/,
  /amazon-adsystem/,
  // Social embeds (slow)
  /platform\.twitter/,
  /platform\.linkedin/,
  /connect\.facebook\.net/,
  // Maps (heavy)
  /maps\.googleapis/,
  /maps\.google/,
  /tile\.openstreetmap/,
  // CDN trackers
  /cdn\.ampproject/,
  /cdn\.segment/,
  // YouTube embeds (when not testing video page)
  /youtube\.com\/embed/,
  /youtube-nocookie/,
  /ytimg\.com/,
  // Other heavy third-party
  /intercom/,
  /drift/,
  /crisp/,
  /zendesk/,
  /freshchat/,
];

// Patterns to abort specific resource types
const BLOCKED_RESOURCE_TYPES = [
  'image',
  'media',
  'font',
];

// Hosts that are always allowed (our own app)
const ALLOWED_HOSTS = [
  'localhost',
  '127.0.0.1',
  'rina.devopsya.com',
  'turn.devopsya.com',
];

export async function blockUnnecessaryResources(page: Page): Promise<void> {
  await page.route('**/*', async (route, request) => {
    const url = request.url();
    const resourceType = request.resourceType();
    const hostname = new URL(url).hostname;

    // Always allow same-origin / app requests
    if (ALLOWED_HOSTS.some(h => hostname.includes(h))) {
      return route.continue();
    }

    // Block by resource type (images, media, fonts)
    if (BLOCKED_RESOURCE_TYPES.includes(resourceType)) {
      return route.abort('blockedbyclient');
    }

    // Block by URL pattern (tracking, ads, widgets)
    if (BLOCKED_PATTERNS.some(pattern => pattern.test(url))) {
      return route.abort('blockedbyclient');
    }

    // Everything else passes through
    return route.continue();
  });
}

/**
 * Lightweight version — blocks only images + fonts + tracking
 * Keeps API calls, CSS, JS from the app working.
 */
export async function blockHeavyResources(page: Page): Promise<void> {
  await page.route('**/*', (route, request) => {
    const url = request.url();
    const resourceType = request.resourceType();
    const hostname = new URL(url).hostname;

    if (ALLOWED_HOSTS.some(h => hostname.includes(h))) {
      return route.continue();
    }

    if (BLOCKED_RESOURCE_TYPES.includes(resourceType)) {
      return route.abort('blockedbyclient');
    }

    if (BLOCKED_PATTERNS.some(pattern => pattern.test(url))) {
      return route.abort('blockedbyclient');
    }

    return route.continue();
  });
}
