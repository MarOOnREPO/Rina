import { defineConfig, devices } from '@playwright/test';

/**
 * Docker-optimized Playwright config
 * - No local dev servers (assumes external URL or docker-compose network)
 * - Single worker for container isolation
 * - Auth setup project logs in once, saves state, reuses across tests
 * - HTML + JSON reporters for CI pipelines
 */

const BASE_URL = process.env.TEST_BASE_URL || 'https://rina.devopsya.com';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on',
    video: 'on',
    screenshot: 'on',
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
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
      dependencies: ['setup'],
    },
    {
      name: 'chromium-maroon',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        storageState: 'playwright/.auth/maroon.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'chromium-rina',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        storageState: 'playwright/.auth/rina.json',
      },
      dependencies: ['setup'],
    },
  ],
});
