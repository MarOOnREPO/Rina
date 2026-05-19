import { defineConfig, devices } from '@playwright/test';

const JWT_SECRET = 'dev_jwt_secret_for_testing_only_32chars_longer';
const COOKIE_SECRET = 'dev_cookie_secret_for_testing_32chars';
const DB_URL = 'postgresql://rina_user:devpass@localhost:5432/rina_db';
const REDIS_URL = 'redis://localhost:6379';
const PASS_HASH = '$2a$12$WcB9E2PSsylo40wf6xfLM.nvmI7gRLv2YOJy9X1g1OtRO4Zns4Ejm';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      command: `export JWT_SECRET='${JWT_SECRET}' && export COOKIE_SECRET='${COOKIE_SECRET}' && export DATABASE_URL='${DB_URL}' && export REDIS_URL='${REDIS_URL}' && export MAROON_PASSWORD_HASH='${PASS_HASH}' && export RINA_PASSWORD_HASH='${PASS_HASH}' && export CORS_ORIGIN='http://localhost:5173' && export FRONTEND_URL='http://localhost:5173' && export AWS_ACCESS_KEY_ID='test' && export AWS_SECRET_ACCESS_KEY='test' && export NODE_ENV='development' && cd ../backend && npm run dev`,
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
