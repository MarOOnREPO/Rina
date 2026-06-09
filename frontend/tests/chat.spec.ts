import { test, expect } from '@playwright/test';

test.describe('Chat', () => {
  test('renders chat page', async ({ page }) => {
    await page.goto('/chat');
    await expect(page.locator('nav a:has-text("Chat")').first()).toBeVisible();
  });
});
