import { test, expect } from '@playwright/test';
import { blockHeavyResources } from './_network-interceptor';

/**
 * Full App E2E Tests — Authenticated Flow
 * Tests the complete user journey: login → dashboard → chat → cycle → video
 */

const BASE_URL = process.env.TEST_BASE_URL || 'https://rina.devopsya.com';

// Skip these tests in CI unless credentials are provided
const MAROON_PASSWORD = process.env.MAROON_PASSWORD || 'maroon123';
const RINA_PASSWORD = process.env.RINA_PASSWORD || 'rina123';
const testWithAuth = test;

test.describe('Full App — Authenticated Flow', () => {
  test.beforeEach(async ({ page }) => {
    await blockHeavyResources(page);
  });

  testWithAuth('login and reach dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Fill login form
    await page.locator('input[placeholder*="maroon"], input[type="text"]').first().fill('maroon');
    await page.locator('input[type="password"]').first().fill(MAROON_PASSWORD);
    await page.locator('button:has-text("Enter")').first().click();

    // Wait for dashboard to load
    await page.waitForURL('/', { timeout: 10000 });
    await expect(page.locator('text=Thinking of You').or(page.locator('text=Dashboard'))).toBeVisible({ timeout: 10000 });

    // Verify navigation tiles exist
    await expect(page.locator('a[href="/chat"]').first()).toBeVisible();
    await expect(page.locator('a[href="/calendar"]').first()).toBeVisible();
    await expect(page.locator('a[href="/movies"]').first()).toBeVisible();
    await expect(page.locator('a[href="/cycle"]').first()).toBeVisible();
  });

  testWithAuth('chat page loads with partner status', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.locator('input[placeholder*="maroon"], input[type="text"]').first().fill('maroon');
    await page.locator('input[type="password"]').first().fill(MAROON_PASSWORD);
    await page.locator('button:has-text("Enter")').first().click();
    await page.waitForURL('/', { timeout: 10000 });

    // Navigate to chat
    await page.click('a[href="/chat"]');
    await page.waitForURL('/chat', { timeout: 10000 });

    // Chat header should show partner name and status
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 10000 });
  });

  testWithAuth('cycle tracker page loads and can add entry', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.locator('input[placeholder*="maroon"], input[type="text"]').first().fill('maroon');
    await page.locator('input[type="password"]').first().fill(MAROON_PASSWORD);
    await page.locator('button:has-text("Enter")').first().click();
    await page.waitForURL('/', { timeout: 10000 });

    // Navigate to cycle
    await page.click('a[href="/cycle"]');
    await page.waitForURL('/cycle', { timeout: 10000 });

    // Cycle tracker header
    await expect(page.locator('text=Cycle Tracker')).toBeVisible({ timeout: 10000 });

    // Open form
    await page.click('text=+ Entry');
    await expect(page.locator('text=New Entry')).toBeVisible();

    // Select a date
    await page.locator('input[type="date"]').fill(new Date().toISOString().split('T')[0]);

    // Save entry
    await page.click('text=Save Entry');

    // Should show success or close form
    await expect(page.locator('text=New Entry')).not.toBeVisible({ timeout: 10000 });
  });
});

test.describe('Full App — Public Pages', () => {
  test.beforeEach(async ({ page }) => {
    await blockHeavyResources(page);
  });

  test('login page has all interactive elements', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('input[type="text"], input[type="password"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('button').first()).toBeVisible();
    await expect(page.locator('text=Welcome back').or(page.locator('text=Project Rina'))).toBeVisible();
  });

  test('API endpoints are healthy', async ({ request }) => {
    const health = await request.get(`${BASE_URL}/api/health`);
    expect(health.ok()).toBeTruthy();
    const body = await health.json();
    expect(body.status).toBe('healthy');

    const config = await request.get(`${BASE_URL}/api/config`);
    expect(config.ok()).toBeTruthy();
  });

  test('WebSocket endpoint is accessible', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Check that the WebSocket connection attempt happens without 404
    const wsErrors: string[] = [];
    page.on('websocket', ws => {
      ws.on('close', () => {
        // WS closing is normal if not authenticated
      });
    });
    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('404')) {
        wsErrors.push(msg.text());
      }
    });

    // Wait a bit for any WS connection attempt
    await page.waitForTimeout(3000);

    // Should not see 404 errors for /ws
    expect(wsErrors.filter(e => e.includes('/ws'))).toHaveLength(0);
  });
});
