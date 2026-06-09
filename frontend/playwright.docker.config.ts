import { defineConfig, devices } from '@playwright/test';

/**
 * Docker-optimized Playwright config
 * - No local dev servers (assumes external URL or docker-compose network)
 * - Single worker for container isolation
 * - HTML + JSON reporters for CI pipelines
 */

const BASE_URL = process.env.TEST_BASE_URL || 'https://rina.devopsya.com';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/html-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: BASE_URL,
    // ─── Trace Viewer + Video ────────────────────────────────────
    trace: 'on',                 // Record trace for EVERY test
    video: 'on',                 // Record video for EVERY test
    screenshot: 'on',            // Screenshot on failure + success
    // ─── Network interception ────────────────────────────────────
    // Blocks images, external fonts, tracking scripts globally
    // See tests/_network-interceptor.ts for route definitions
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
    launchOptions: {
      args: [
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Container-optimized viewport
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  // No webServer — assumes app is already running (docker-compose or deployed)
});
