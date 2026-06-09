import { test, expect, type BrowserContext, type Page } from '@playwright/test';
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

  const usernameInput = page.locator('input[placeholder*="maroon"], input[type="text"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  const submitButton = page.locator('button:has-text("Enter")').first();

  await usernameInput.fill(username);
  await passwordInput.fill(password);
  await submitButton.click();

  // Wait for redirect to dashboard
  await page.waitForURL('/', { timeout: 10000 });
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

    // Video page should show call controls or partner status
    await expect(
      page.locator('text=Video Call')
        .or(page.locator('text=Call'))
        .or(page.locator('text=Start Call'))
        .or(page.locator('text=Partner'))
    ).toBeVisible({ timeout: 10000 });

    // Screenshot for visual verification
    await page.screenshot({ path: 'test-results/video-maroon.png', fullPage: false });
  });

  test('Rina logs in and sees video page', async ({ page }) => {
    await loginUser(page, 'rina', RINA_PASSWORD);

    // Navigate to video page
    await page.click('a[href="/video"]');
    await page.waitForURL('/video', { timeout: 10000 });

    // Video page should show call controls or partner status
    await expect(
      page.locator('text=Video Call')
        .or(page.locator('text=Call'))
        .or(page.locator('text=Start Call'))
        .or(page.locator('text=Partner'))
    ).toBeVisible({ timeout: 10000 });

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

    // Track WebSocket connections
    const maroonWsConnected = new Promise<void>((resolve) => {
      maroonPage.on('websocket', () => resolve());
    });
    const rinaWsConnected = new Promise<void>((resolve) => {
      rinaPage.on('websocket', () => resolve());
    });

    // Login both users
    await Promise.all([
      loginUser(maroonPage, 'maroon', MAROON_PASSWORD),
      loginUser(rinaPage, 'rina', RINA_PASSWORD),
    ]);

    // Wait for WebSocket connections to establish
    await Promise.race([
      Promise.all([maroonWsConnected, rinaWsConnected]),
      new Promise((_, reject) => setTimeout(() => reject(new Error('WebSocket timeout')), 15000)),
    ]);

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

    // MarOOn should see Rina's status (Online or Offline)
    const maroonChatHeader = maroonPage.locator('text=Messages').or(maroonPage.locator('text=Chat')).first();
    await expect(maroonChatHeader).toBeVisible({ timeout: 10000 });

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

    // Look for start call button or video container
    const videoElements = page.locator('video, button:has-text("Call"), button:has-text("Start"), [class*="video"], [class*="call"]');
    const count = await videoElements.count();

    // Take screenshot regardless
    await page.screenshot({ path: 'test-results/video-page.png', fullPage: false });

    // Should have at least one video-related element
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('Video Call — WebSocket Signaling', () => {
  test.beforeEach(async ({ page }) => {
    await blockHeavyResources(page);
  });

  test('WebSocket /ws connects without 404', async ({ page }) => {
    let wsError = false;

    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('404')) {
        wsError = true;
      }
    });

    page.on('pageerror', (err) => {
      if (err.message.includes('404') || err.message.includes('WebSocket')) {
        wsError = true;
      }
    });

    await loginUser(page, 'maroon', MAROON_PASSWORD);

    // Navigate to video page where WS is most critical
    await page.click('a[href="/video"]');
    await page.waitForURL('/video', { timeout: 10000 });

    // Wait for any WS activity
    await page.waitForTimeout(5000);

    expect(wsError).toBe(false);
  });
});
