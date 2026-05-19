import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '../playwright/.auth/user.json');

setup('authenticate as maroon', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Login via API to set HTTP-only cookie
  const res = await page.request.post('/api/auth/login', {
    data: { username: 'maroon', password: process.env.E2E_PASSWORD || 'testpass123' }
  });

  if (!res.ok()) {
    throw new Error(`Login API failed: ${await res.text()}`);
  }

  // Verify we can access the dashboard
  await page.goto('/');
  await expect(page.locator('text=Thinking of You')).toBeVisible();

  await context.storageState({ path: authFile });
  await context.close();
});
