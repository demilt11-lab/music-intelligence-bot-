import { test, expect } from '@playwright/test';
import { authFile } from './fixtures';

// Reuse the captured session (every page is behind the proxy.ts auth gate).
test.use({ storageState: authFile });

// Renders each core section in a real browser and confirms it loads its own
// content without an error boundary — the browser-level coverage the smoke
// (HTTP-only) suite can't provide.
test.describe('Core pages render', () => {
  test('home renders the command center hero', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /A&R intelligence command center/i }),
    ).toBeVisible();
  });

  const pages = [
    { path: '/watchlist', check: (p: import('@playwright/test').Page) => p.getByRole('heading', { name: 'Watchlist', level: 1 }) },
    { path: '/search', check: (p: import('@playwright/test').Page) => p.getByRole('heading', { name: 'Search', level: 1 }) },
    { path: '/artists', check: (p: import('@playwright/test').Page) => p.getByRole('heading', { name: 'Artist Intelligence', level: 1 }) },
    { path: '/ar-bot', check: (p: import('@playwright/test').Page) => p.getByPlaceholder(/Ask Buddy about artists, scores/i) },
  ];

  for (const { path, check } of pages) {
    test(`${path} renders its content without an error boundary`, async ({ page }) => {
      await page.goto(path);
      await expect(check(page)).toBeVisible();
      await expect(page.locator('body')).not.toContainText('Application error');
      await expect(page.locator('body')).not.toContainText('Something went wrong');
    });
  }
});
