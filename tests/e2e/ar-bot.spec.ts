import { test, expect } from '@playwright/test';
import { authFile } from './fixtures';

test.use({ storageState: authFile });

// The A&R Bot chat is a core assistive surface. This drives its client-side
// input + Send control in a browser and verifies the disabled-until-input
// guard (the same class of BUG-009 defect the CommandBar test protects against).
test.describe('A&R Bot', () => {
  test('renders the chat input and gates Send on input', async ({ page }) => {
    await page.goto('/ar-bot');

    const input = page.getByPlaceholder(/Ask Buddy about artists, scores/i);
    const send = page.getByRole('button', { name: /^Send$/ });

    await expect(input).toBeVisible();
    // Empty input must not submit — the Send button is disabled.
    await expect(send).toBeDisabled();

    await input.fill('who is breaking in afrobeats?');
    await expect(send).toBeEnabled();

    await expect(page.locator('body')).not.toContainText('Application error');
  });
});
