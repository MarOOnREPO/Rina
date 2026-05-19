import { test, expect } from '@playwright/test';

test.describe('Cinema', () => {
  test('lobby renders with source toggle', async ({ page }) => {
    await page.goto('/cinema');
    await expect(page.locator('text=Cinema Room')).toBeVisible();
    await expect(page.locator('text=Direct Link')).toBeVisible();
    await expect(page.locator('text=Magnet / Torrent')).toBeVisible();
    await expect(page.locator('text=Start Watching')).toBeDisabled();
  });

  test('enables start button after entering url', async ({ page }) => {
    await page.goto('/cinema');
    await page.fill('input[type="text"]', 'https://example.com/video.mkv');
    await expect(page.locator('text=Start Watching')).toBeEnabled();
  });
});
