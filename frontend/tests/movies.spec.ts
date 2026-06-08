import { test, expect } from '@playwright/test';

test.describe('Movies', () => {
  test('renders movie library', async ({ page }) => {
    await page.goto('/movies');
    await expect(page.locator('text=Movie Library')).toBeVisible();
  });

  test('shows upload button for admin', async ({ page }) => {
    await page.goto('/movies');
    await expect(page.locator('text=Upload')).toBeVisible();
  });
});
