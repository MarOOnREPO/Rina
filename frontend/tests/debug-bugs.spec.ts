import { test, expect } from '@playwright/test';
import { blockHeavyResources } from './_network-interceptor';

test.describe('Debug Bug Areas', () => {
  test.beforeEach(async ({ page }) => { await blockHeavyResources(page); });

  test('MarOOn - Movies Browse fails to load', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.locator('input[type="text"]').first().fill('maroon');
    await page.locator('input[type="password"]').first().fill('maroon123');
    await page.locator('button:has-text("Enter")').click();
    await page.waitForURL('/', { timeout: 15000 });

    await page.goto('/movies/browse');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Verify page loaded successfully (TMDB routes now fixed)
    await expect(page.locator('text=Discover Movies')).toBeVisible();

    await page.screenshot({ path: 'test-results/debug-movies-browse.png' });
  });

  test('MarOOn - Video Call page layout', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.locator('input[type="text"]').first().fill('maroon');
    await page.locator('input[type="password"]').first().fill('maroon123');
    await page.locator('button:has-text("Enter")').click();
    await page.waitForURL('/', { timeout: 15000 });

    await page.goto('/video');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Check for start call button
    const startCall = await page.locator('text=/start call|call|connect/i').first().isVisible().catch(() => false);
    console.log('Start call button visible:', startCall);

    await page.screenshot({ path: 'test-results/debug-video-call.png', fullPage: true });
  });

  test('Both users - presence in video page', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    await blockHeavyResources(p1);
    await blockHeavyResources(p2);

    // Login both
    for (const { page, user, pass } of [
      { page: p1, user: 'maroon', pass: 'maroon123' },
      { page: p2, user: 'rina', pass: 'rina123' },
    ]) {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');
      await page.locator('input[type="text"]').first().fill(user);
      await page.locator('input[type="password"]').first().fill(pass);
      await page.locator('button:has-text("Enter")').click();
      await page.waitForURL('/', { timeout: 15000 });
    }

    // Go to video page
    await p1.goto('/video');
    await p2.goto('/video');
    await p1.waitForLoadState('networkidle');
    await p2.waitForLoadState('networkidle');
    await p1.waitForTimeout(3000);
    await p2.waitForTimeout(3000);

    // Check presence text
    const p1PartnerStatus = await p1.locator('header, [class*="partner"], [class*="presence"]').first().textContent().catch(() => 'unknown');
    const p2PartnerStatus = await p2.locator('header, [class*="partner"], [class*="presence"]').first().textContent().catch(() => 'unknown');
    console.log('MarOOn sees partner:', p1PartnerStatus);
    console.log('Rina sees partner:', p2PartnerStatus);

    await p1.screenshot({ path: 'test-results/debug-video-maroon.png' });
    await p2.screenshot({ path: 'test-results/debug-video-rina.png' });

    await ctx1.close();
    await ctx2.close();
  });
});
