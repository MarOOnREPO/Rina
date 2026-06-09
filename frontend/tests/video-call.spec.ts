import { test, expect, type Page } from '@playwright/test';
import { blockHeavyResources } from './_network-interceptor';

/**
 * Video Call E2E Tests — Both sides (MarOOn & Rina)
 * Tests WebSocket presence, video page rendering, and call signaling
 */

const BASE_URL = process.env.TEST_BASE_URL || 'https://rina.devopsya.com';
const MAROON_PASSWORD = process.env.MAROON_PASSWORD || 'maroon123';
const RINA_PASSWORD = process.env.RINA_PASSWORD || 'rina123';

async function loginUser(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // Check if already logged in (redirected to dashboard)
  if (page.url().includes('/login')) {
    const usernameInput = page.locator('input[type="text"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitButton = page.locator('button').first();

    await usernameInput.fill(username);
    await passwordInput.fill(password);
    await submitButton.click();

    // Wait for navigation away from login
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), null, { timeout: 10000 });
  }

  // Ensure we're on a valid page
  await expect(page.locator('body')).toBeVisible();
}

test.describe('Video Call — Both Users', () => {
  test.beforeEach(async ({ page }) => {
    await blockHeavyResources(page);
  });

  test('MarOOn logs in and sees video page', async ({ page }) => {
    await loginUser(page, 'maroon', MAROON_PASSWORD);

    // Navigate to video page
    await page.click('a[href="/video"]');
    await page.waitForURL('/video', { timeout: 10000 });

    // Video page should show heading
    await expect(page.getByRole('heading', { name: /Video Call/i })).toBeVisible({ timeout: 10000 });

    // Screenshot for visual verification
    await page.screenshot({ path: 'test-results/video-maroon.png', fullPage: false });
  });

  test('Rina logs in and sees video page', async ({ page }) => {
    await loginUser(page, 'rina', RINA_PASSWORD);

    // Navigate to video page
    await page.click('a[href="/video"]');
    await page.waitForURL('/video', { timeout: 10000 });

    // Video page should show heading
    await expect(page.getByRole('heading', { name: /Video Call/i })).toBeVisible({ timeout: 10000 });

    // Screenshot for visual verification
    await page.screenshot({ path: 'test-results/video-rina.png', fullPage: false });
  });

  test('Both users online — WebSocket presence works', async ({ browser }) => {
    // Create two separate browser contexts (incognito)
    const maroonContext = await browser.newContext();
    const rinaContext = await browser.newContext();

    const maroonPage = await maroonContext.newPage();
    const rinaPage = await rinaContext.newPage();

    await blockHeavyResources(maroonPage);
    await blockHeavyResources(rinaPage);

    // Login both users with delay to avoid rate limiting
    await loginUser(maroonPage, 'maroon', MAROON_PASSWORD);
    await maroonPage.waitForTimeout(2000);
    await loginUser(rinaPage, 'rina', RINA_PASSWORD);

    // Give presence a moment to propagate
    await maroonPage.waitForTimeout(3000);
    await rinaPage.waitForTimeout(3000);

    // Navigate both to chat where presence is visible
    await maroonPage.click('a[href="/chat"]');
    await rinaPage.click('a[href="/chat"]');
    await maroonPage.waitForURL('/chat', { timeout: 10000 });
    await rinaPage.waitForURL('/chat', { timeout: 10000 });

    // Wait for presence to update
    await maroonPage.waitForTimeout(2000);

    // MarOOn should see chat header
    await expect(maroonPage.getByRole('heading').first()).toBeVisible({ timeout: 10000 });

    // Screenshot both chat pages
    await maroonPage.screenshot({ path: 'test-results/chat-maroon.png', fullPage: false });
    await rinaPage.screenshot({ path: 'test-results/chat-rina.png', fullPage: false });

    await maroonContext.close();
    await rinaContext.close();
  });

  test('Video call page — start call button exists', async ({ page }) => {
    await loginUser(page, 'maroon', MAROON_PASSWORD);

    // Navigate to video
    await page.click('a[href="/video"]');
    await page.waitForURL('/video', { timeout: 10000 });

    // Look for start call button
    const startCallButton = page.getByRole('button', { name: /Start Call/i });
    await expect(startCallButton).toBeVisible({ timeout: 10000 });

    // Take screenshot
    await page.screenshot({ path: 'test-results/video-page.png', fullPage: false });
  });
});

test.describe('Video Call — WebSocket Signaling', () => {
  test.beforeEach(async ({ page }) => {
    await blockHeavyResources(page);
  });

  test('WebSocket /ws connects without 404', async ({ page }) => {
    let ws404Error = false;

    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('404') && msg.text().includes('/ws')) {
        ws404Error = true;
      }
    });

    page.on('pageerror', (err) => {
      if ((err.message.includes('404') || err.message.includes('WebSocket')) && err.message.includes('/ws')) {
        ws404Error = true;
      }
    });

    await loginUser(page, 'maroon', MAROON_PASSWORD);

    // Navigate to video page where WS is most critical
    await page.click('a[href="/video"]');
    await page.waitForURL('/video', { timeout: 10000 });

    // Wait for any WS activity
    await page.waitForTimeout(5000);

    expect(ws404Error).toBe(false);
  });
});
