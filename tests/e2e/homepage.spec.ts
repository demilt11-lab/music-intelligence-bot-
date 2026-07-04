import { test, expect } from '@playwright/test';
import { authFile } from './fixtures';

// The homepage sits behind the same session gate as the rest of the app
// (proxy.ts redirects '/' to /login when signed out), so these tests reuse
// the session captured by auth.setup.ts instead of hitting a login wall.
test.use({ storageState: authFile });

test.describe('Homepage', () => {
  test('renders the command center hero', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /A&R intelligence command center/i })).toBeVisible();
  });

  test('CommandBar disables Run task until a query is entered, then navigates to /search', async ({ page }) => {
    await page.goto('/');

    const input = page.getByRole('textbox', { name: /search the music intelligence graph/i });
    const submit = page.getByRole('button', { name: /run task/i });

    // BUG-009: submitting empty must not silently no-op — the button is disabled instead.
    await expect(submit).toBeDisabled();

    await input.fill('Charli XCX');
    await expect(submit).toBeEnabled();

    await submit.click();
    await page.waitForURL(/\/search\?q=Charli(%20|\+)XCX/i);
  });
});
