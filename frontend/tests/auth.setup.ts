import { test as setup, expect } from '@playwright/test';
import { blockHeavyResources } from './_network-interceptor';

const MAROON_PASSWORD = process.env.MAROON_PASSWORD || 'maroon123';
const RINA_PASSWORD = process.env.RINA_PASSWORD || 'rina123';

setup.beforeEach(async ({ page }) => {
  await blockHeavyResources(page);
});

setup('authenticate as maroon', async ({ page }) => {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  await page.locator('input[type="text"]').first().fill('maroon');
  await page.locator('input[type="password"]').first().fill(MAROON_PASSWORD);
  await page.locator('button').first().click();

  // Wait for redirect to dashboard
  await page.waitForURL('/', { timeout: 10000 });
  await expect(page.locator('body')).toBeVisible();

  // Save auth state for reuse
  await page.context().storageState({ path: 'playwright/.auth/maroon.json' });
});

setup('authenticate as rina', async ({ page }) => {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  await page.locator('input[type="text"]').first().fill('rina');
  await page.locator('input[type="password"]').first().fill(RINA_PASSWORD);
  await page.locator('button').first().click();

  // Wait for redirect to dashboard
  await page.waitForURL('/', { timeout: 10000 });
  await expect(page.locator('body')).toBeVisible();

  // Save auth state for reuse
  await page.context().storageState({ path: 'playwright/.auth/rina.json' });
});
