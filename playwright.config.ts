import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 45000, fullyParallel: false, workers: 1,
  reporter: 'list', use: { baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:7777', headless: true,
    viewport: { width: 1440, height: 1100 }, screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
  },
});
