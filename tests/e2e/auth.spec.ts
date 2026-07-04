import { test, expect } from '@playwright/test';
import { E2E_EMAIL, E2E_PASSWORD } from './fixtures';

test.describe('Authentication', () => {
  test('visiting a protected page while signed out redirects to /login', async ({ page }) => {
    await page.goto('/artists');
    await expect(page).toHaveURL(/\/login\?next=%2Fartists/);
  });

  test('signing in with valid credentials grants access to protected pages', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(E2E_EMAIL);
    await page.getByLabel('Password').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL('/');
    await expect(page.getByText(/buddy is online/i)).toBeVisible();

    // A route the pre-login redirect test proved was gated is now reachable.
    await page.goto('/artists');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('signing in with a wrong password shows an inline error and stays on /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(E2E_EMAIL);
    await page.getByLabel('Password').fill('definitely-wrong-password');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });
});
