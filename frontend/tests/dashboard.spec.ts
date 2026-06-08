import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('renders patchwork tiles', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('a[href="/chat"]').first()).toBeVisible();
    await expect(page.locator('a[href="/calendar"]').first()).toBeVisible();
    await expect(page.locator('a[href="/movies"]').first()).toBeVisible();
    await expect(page.locator('a[href="/jam"]').first()).toBeVisible();
    await expect(page.locator('a[href="/video"]').first()).toBeVisible();
    await expect(page.locator('a[href="/cycle"]').first()).toBeVisible();
  });

  test('navigates to movies', async ({ page }) => {
    await page.goto('/');
    await page.click('a[href="/movies"]');
    await expect(page.locator('text=Movie Library')).toBeVisible();
  });

  test('navigates to jam', async ({ page }) => {
    await page.goto('/');
    await page.click('a[href="/jam"]');
    await expect(page.locator('text=YouTube')).toBeVisible();
  });
});
