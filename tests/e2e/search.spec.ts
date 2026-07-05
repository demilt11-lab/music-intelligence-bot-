import { test, expect } from '@playwright/test';
import { authFile } from './fixtures';

test.use({ storageState: authFile });

// Search is a core A&R entry point. This renders the real page and drives the
// client-side search box + type filter in a browser (things the HTTP smoke
// can't verify), independent of seeded data.
test.describe('Search', () => {
  test('renders the search UI and accepts input', async ({ page }) => {
    await page.goto('/search');

    await expect(page.getByRole('heading', { name: 'Search', level: 1 })).toBeVisible();

    const input = page.getByPlaceholder(/Artist name, track, playlist, or paste/i);
    await expect(input).toBeVisible();
    await input.fill('Charli XCX');
    await expect(input).toHaveValue('Charli XCX');
  });

  test('carries an initial query from the URL into the field', async ({ page }) => {
    // This is the CommandBar → /search?q=… handoff the homepage test starts.
    await page.goto('/search?q=Dua%20Lipa');
    await expect(page.getByPlaceholder(/Artist name, track, playlist, or paste/i)).toHaveValue('Dua Lipa');
    // The page settles without an error boundary even when no data matches.
    await expect(page.locator('body')).not.toContainText('Application error');
  });
});
