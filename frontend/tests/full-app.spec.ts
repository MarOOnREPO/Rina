import { test, expect } from '@playwright/test';
import { blockHeavyResources } from './_network-interceptor';

/**
 * Full App E2E Tests — Authenticated Flow
 * Assumes auth.setup.ts has already logged in and saved state.
 */

const BASE_URL = process.env.TEST_BASE_URL || 'https://rina.devopsya.com';

test.describe('Full App — Authenticated Flow (MarOOn)', () => {
  test.use({ storageState: 'playwright/.auth/maroon.json' });

  test.beforeEach(async ({ page }) => {
    await blockHeavyResources(page);
  });

  test('dashboard loads with navigation tiles', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for dashboard to load
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

    // Verify navigation tiles exist
    await expect(page.locator('a[href="/chat"]').first()).toBeVisible();
    await expect(page.locator('a[href="/calendar"]').first()).toBeVisible();
    await expect(page.locator('a[href="/movies"]').first()).toBeVisible();
    await expect(page.locator('a[href="/cycle"]').first()).toBeVisible();
    await expect(page.locator('a[href="/video"]').first()).toBeVisible();
  });

  test('chat page loads', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Chat header should be visible
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 10000 });
  });

  test('cycle tracker page loads', async ({ page }) => {
    await page.goto('/cycle');
    await page.waitForLoadState('networkidle');

    // Cycle tracker header
    await expect(page.getByRole('heading', { name: /Cycle Tracker/i })).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Full App — Public Pages', () => {
  test.beforeEach(async ({ page }) => {
    await blockHeavyResources(page);
  });

  test('login page has all interactive elements', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('input[type="text"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('button').first()).toBeVisible();
  });

  test('API endpoints are healthy', async ({ request }) => {
    const health = await request.get(`${BASE_URL}/api/health`);
    expect(health.ok()).toBeTruthy();
    const body = await health.json();
    expect(body.status).toBe('healthy');

    const config = await request.get(`${BASE_URL}/api/config`);
    expect(config.ok()).toBeTruthy();
  });

  test('WebSocket endpoint is accessible', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    let ws404Error = false;
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('404') && msg.text().includes('/ws')) {
        ws404Error = true;
      }
    });

    await page.waitForTimeout(3000);
    expect(ws404Error).toBe(false);
  });
});
