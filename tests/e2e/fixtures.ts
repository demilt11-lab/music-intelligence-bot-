import path from 'path';

export const E2E_EMAIL = 'e2e-user@test.local';
export const E2E_PASSWORD = 'e2e-test-password-1';
export const E2E_TENANT_SLUG = process.env.UI_TENANT_SLUG ?? 'workspace';
export const authFile = path.join(__dirname, '.auth/user.json');
