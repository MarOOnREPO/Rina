import { test, expect } from '@playwright/test';

test.describe('Goals', () => {
  test('creates a new goal', async ({ page }) => {
    await page.goto('/goals');
    await expect(page.getByRole('heading', { name: '🎯 Goals' })).toBeVisible();

    await page.getByRole('button', { name: /New/ }).click();
    await page.fill('input[placeholder*="e.g. Trip to Japan"]', 'Playwright Test Goal');
    await page.fill('input[type="number"]', '500');
    await page.locator('button:has-text("Save")').click();

    await expect(page.getByRole('heading', { name: 'Playwright Test Goal' }).first()).toBeVisible();
    await expect(page.getByText('€0 of €500').first()).toBeVisible();
  });

  test('shows validation error for empty title', async ({ page }) => {
    await page.goto('/goals');
    await page.getByRole('button', { name: /New/ }).click();
    await page.fill('input[type="number"]', '100');
    await page.locator('button:has-text("Save")').click();
    await expect(page.getByText('Title and a valid target amount are required').first()).toBeVisible();
  });
});
