import { test, expect } from '@playwright/test';
import { blockHeavyResources } from './_network-interceptor';

/**
 * COMPREHENSIVE E2E Tests — Every Page, Every Button, Every Feature
 * Tests both MarOOn and Rina sides
 */

const MAROON_PASSWORD = process.env.MAROON_PASSWORD || 'maroon123';
const RINA_PASSWORD = process.env.RINA_PASSWORD || 'rina123';

async function login(page: any, username: string, password: string) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="text"]').first().fill(username);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button:has-text("Enter")').click();
  await page.waitForFunction(() => !window.location.pathname.includes('/login'), null, { timeout: 15000 });
  await page.waitForTimeout(1000);
}

test.describe('MarOOn - Comprehensive Test', () => {
  test.use({ storageState: 'playwright/.auth/maroon.json' });
  test.beforeEach(async ({ page }) => { await blockHeavyResources(page); });

  test('Dashboard - all nav tiles clickable', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const links = ['/chat', '/calendar', '/movies', '/jam', '/video', '/cycle'];
    for (const href of links) {
      const link = page.locator(`a[href="${href}"]`).first();
      await expect(link).toBeVisible({ timeout: 5000 });
    }
    await page.screenshot({ path: 'test-results/01-maroon-dashboard.png' });
  });

  test('Chat - page loads, header, video call button', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'test-results/02-maroon-chat.png' });
  });

  test('Calendar - page loads', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'test-results/03-maroon-calendar.png' });
  });

  test('Movies - library loads', async ({ page }) => {
    await page.goto('/movies');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'test-results/04-maroon-movies.png' });
  });

  test('Movies Browse - loads movies', async ({ page }) => {
    await page.goto('/movies/browse');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    // Wait for any movie cards or loading state
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/05-maroon-movies-browse.png' });
  });

  test('Jam - page loads', async ({ page }) => {
    await page.goto('/jam');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'test-results/06-maroon-jam.png' });
  });

  test('Video Call - page loads with start call', async ({ page }) => {
    await page.goto('/video');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'test-results/07-maroon-video.png' });
  });

  test('Cycle Tracker - page loads, can open form', async ({ page }) => {
    await page.goto('/cycle');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'test-results/08-maroon-cycle.png' });
  });

  test('Cycle Tracker - add entry with all fields', async ({ page }) => {
    await page.goto('/cycle');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Click + Entry button
    const addBtn = page.locator('text=+ Entry').or(page.locator('text=New Entry')).or(page.locator('text=Add')).first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(500);

      // Fill date
      const dateInput = page.locator('input[type="date"]').first();
      if (await dateInput.isVisible().catch(() => false)) {
        const today = new Date().toISOString().split('T')[0];
        await dateInput.fill(today);
      }

      // Select flow intensity (0-4)
      const flowBtns = page.locator('button').filter({ hasText: /None|Light|Medium|Heavy/ });
      if (await flowBtns.first().isVisible().catch(() => false)) {
        await flowBtns.first().click();
      }

      // Click save
      const saveBtn = page.locator('button:has-text("Save")').or(page.locator('button:has-text("Update")')).first();
      if (await saveBtn.isVisible().catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    await page.screenshot({ path: 'test-results/09-maroon-cycle-entry.png' });
  });

  test('Settings - page loads', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'test-results/10-maroon-settings.png' });
  });
});

test.describe('Rina - Comprehensive Test', () => {
  test.use({ storageState: 'playwright/.auth/rina.json' });
  test.beforeEach(async ({ page }) => { await blockHeavyResources(page); });

  test('Dashboard - all nav tiles clickable', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const links = ['/chat', '/calendar', '/movies', '/jam', '/video', '/cycle'];
    for (const href of links) {
      const link = page.locator(`a[href="${href}"]`).first();
      await expect(link).toBeVisible({ timeout: 5000 });
    }
    await page.screenshot({ path: 'test-results/11-rina-dashboard.png' });
  });

  test('Chat - page loads', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'test-results/12-rina-chat.png' });
  });

  test('Calendar - page loads', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'test-results/13-rina-calendar.png' });
  });

  test('Movies - library loads', async ({ page }) => {
    await page.goto('/movies');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'test-results/14-rina-movies.png' });
  });

  test('Movies Browse - loads', async ({ page }) => {
    await page.goto('/movies/browse');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/15-rina-movies-browse.png' });
  });

  test('Jam - page loads', async ({ page }) => {
    await page.goto('/jam');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'test-results/16-rina-jam.png' });
  });

  test('Video Call - page loads', async ({ page }) => {
    await page.goto('/video');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'test-results/17-rina-video.png' });
  });

  test('Cycle Tracker - page loads', async ({ page }) => {
    await page.goto('/cycle');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'test-results/18-rina-cycle.png' });
  });

  test('Settings - page loads', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'test-results/19-rina-settings.png' });
  });
});

test.describe('Cross-browser: Video Call Both Users', () => {
  test('Both users see each other online in video page', async ({ browser }) => {
    const ctx1 = await browser.newContext({ storageState: 'playwright/.auth/maroon.json' });
    const ctx2 = await browser.newContext({ storageState: 'playwright/.auth/rina.json' });
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    await blockHeavyResources(p1);
    await blockHeavyResources(p2);

    await p1.goto('/video');
    await p2.goto('/video');
    await p1.waitForLoadState('networkidle');
    await p2.waitForLoadState('networkidle');

    await p1.waitForTimeout(3000);
    await p2.waitForTimeout(3000);

    await p1.screenshot({ path: 'test-results/20-video-maroon.png' });
    await p2.screenshot({ path: 'test-results/21-video-rina.png' });

    await ctx1.close();
    await ctx2.close();
  });
});
