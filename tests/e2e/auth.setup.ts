import { test as setup } from '@playwright/test';
import { E2E_EMAIL, E2E_PASSWORD, authFile } from './fixtures';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_EMAIL);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
  await page.context().storageState({ path: authFile });
});
