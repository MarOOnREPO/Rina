import { test, expect } from '@playwright/test';
import { blockUnnecessaryResources } from './_network-interceptor';

/**
 * Production Smoke Tests for Project Rina
 * These tests run against the live deployment at https://rina.devopsya.com
 * They verify core functionality without requiring authentication setup.
 */

test.beforeEach(async ({ page }) => {
  // Block images, fonts, and tracking scripts to speed up tests
  await blockUnnecessaryResources(page);
});

test.describe('Production Smoke', () => {
  test('homepage loads with correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Project Rina/);
  });

  test('login page loads successfully', async ({ page }) => {
    const response = await page.goto('/login');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Project Rina/);
  });

  test('API health endpoint responds', async ({ request }) => {
    const response = await request.get('https://rina.devopsya.com/api/health');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('healthy');
  });

  test('static assets have correct cache headers', async ({ request }) => {
    // index.html should not be cached
    const indexResp = await request.get('https://rina.devopsya.com/');
    const indexCache = indexResp.headers()['cache-control'] || '';
    expect(indexCache.includes('no-store') || indexCache.includes('no-cache') || indexCache === '').toBeTruthy();
  });

  test('service-worker is not cached aggressively', async ({ request }) => {
    const resp = await request.get('https://rina.devopsya.com/service-worker.js');
    // 404 is fine if no SW is built, but if it exists, check cache headers
    if (resp.status() === 200) {
      const cache = resp.headers()['cache-control'] || '';
      expect(cache.includes('no-store') || cache.includes('no-cache')).toBeTruthy();
    }
  });
});
