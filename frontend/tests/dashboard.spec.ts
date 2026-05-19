import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('renders patchwork tiles', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('a[href="/chat"]').first()).toBeVisible();
    await expect(page.locator('a[href="/calendar"]').first()).toBeVisible();
    await expect(page.locator('a[href="/cinema"]').first()).toBeVisible();
    await expect(page.locator('a[href="/jam"]').first()).toBeVisible();
  });

  test('navigates to cinema', async ({ page }) => {
    await page.goto('/');
    await page.click('a[href="/cinema"]');
    await expect(page.locator('text=Cinema Room')).toBeVisible();
    await expect(page.locator('text=Direct Link')).toBeVisible();
  });

  test('navigates to jam', async ({ page }) => {
    await page.goto('/');
    await page.click('a[href="/jam"]');
    await expect(page.locator('text=Spotify Jam')).toBeVisible();
    await expect(page.locator('text=Connect Spotify Premium')).toBeVisible();
  });
});
