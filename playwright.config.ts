import { defineConfig, devices } from '@playwright/test';

/**
 * Browser-driven E2E suite — complements scripts/smoke.ts (HTTP-level only)
 * by rendering real pages and exercising client-side JS (form validation,
 * client-side routing, redirect-on-auth), which an HTTP smoke test can't see.
 *
 * PLAYWRIGHT_CHROMIUM_PATH lets a sandboxed dev environment point at a
 * pre-installed browser binary instead of downloading one; CI leaves it
 * unset and uses Playwright's own managed browser install.
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: {
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
    {
      name: 'chromium',
      testIgnore: /auth\.setup\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
  webServer: {
    command: 'npm run start',
    url: `${process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
