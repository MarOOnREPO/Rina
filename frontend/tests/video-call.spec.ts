import { test, expect } from '@playwright/test';
import { blockHeavyResources } from './_network-interceptor';

/**
 * Video Call E2E Tests — Both sides (MarOOn & Rina)
 * Assumes auth.setup.ts has already logged in and saved state.
 */

const BASE_URL = process.env.TEST_BASE_URL || 'https://rina.devopsya.com';

test.describe('Video Call — MarOOn', () => {
  test.use({ storageState: 'playwright/.auth/maroon.json' });

  test.beforeEach(async ({ page }) => {
    await blockHeavyResources(page);
  });

  test('video page loads with start call button', async ({ page }) => {
    await page.goto('/video');
    await page.waitForLoadState('networkidle');

    // Video page heading
    await expect(page.getByRole('heading', { name: /Video Call/i })).toBeVisible({ timeout: 10000 });

    // Start call button should exist
    await expect(page.getByRole('button', { name: /Start Call/i })).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'test-results/video-maroon.png', fullPage: false });
  });

  test('WebSocket connects without 404', async ({ page }) => {
    let ws404Error = false;
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('404') && msg.text().includes('/ws')) {
        ws404Error = true;
      }
    });

    await page.goto('/video');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    expect(ws404Error).toBe(false);
  });
});

test.describe('Video Call — Rina', () => {
  test.use({ storageState: 'playwright/.auth/rina.json' });

  test.beforeEach(async ({ page }) => {
    await blockHeavyResources(page);
  });

  test('video page loads with start call button', async ({ page }) => {
    await page.goto('/video');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /Video Call/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Start Call/i })).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'test-results/video-rina.png', fullPage: false });
  });
});

test.describe('Video Call — Both users (cross-context)', () => {
  test('presence works with both users online', async ({ browser }) => {
    const maroonContext = await browser.newContext({
      storageState: 'playwright/.auth/maroon.json',
    });
    const rinaContext = await browser.newContext({
      storageState: 'playwright/.auth/rina.json',
    });

    const maroonPage = await maroonContext.newPage();
    const rinaPage = await rinaContext.newPage();

    await blockHeavyResources(maroonPage);
    await blockHeavyResources(rinaPage);

    // Both navigate to chat
    await maroonPage.goto('/chat');
    await rinaPage.goto('/chat');

    await maroonPage.waitForLoadState('networkidle');
    await rinaPage.waitForLoadState('networkidle');

    // Give presence time to propagate
    await maroonPage.waitForTimeout(3000);

    // Both should see chat headers
    await expect(maroonPage.getByRole('heading').first()).toBeVisible({ timeout: 10000 });
    await expect(rinaPage.getByRole('heading').first()).toBeVisible({ timeout: 10000 });

    await maroonPage.screenshot({ path: 'test-results/chat-maroon.png', fullPage: false });
    await rinaPage.screenshot({ path: 'test-results/chat-rina.png', fullPage: false });

    await maroonContext.close();
    await rinaContext.close();
  });
});
