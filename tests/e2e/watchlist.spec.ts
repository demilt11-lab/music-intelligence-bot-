import { test, expect } from '@playwright/test';
import { authFile } from './fixtures';

test.use({ storageState: authFile });

// The watchlist page is a client component that fetches /api/ui/watchlist and
// renders the result. This proves that authenticated client-fetch-then-render
// path works in a browser and reaches the empty state without an error boundary
// (the e2e tenant starts with no items).
test.describe('Watchlist', () => {
  test('renders the page and its empty state', async ({ page }) => {
    await page.goto('/watchlist');

    await expect(page.getByRole('heading', { name: 'Watchlist', level: 1 })).toBeVisible();
    await expect(page.getByText(/your shortlist is empty/i)).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Application error');
  });
});
