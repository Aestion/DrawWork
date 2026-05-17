const { test, expect } = require('@playwright/test');
const { generateUnique, registerAccount, loginAccount } = require('./utils');

test.describe('Auth Flow', () => {
  test('user can register a new account', async ({ page }) => {
    const account = await registerAccount(page);

    await expect(page).toHaveURL('/');
    await expect(page.locator(`text=你好, ${account.username}`)).toBeVisible();
    await expect(page.getByRole('button', { name: '+ 新建画板' })).toBeVisible();
  });

  test('user can login with existing account', async ({ page }) => {
    // Step 1: Register a unique account
    const account = await registerAccount(page);

    // Step 2: Logout
    await page.click('text=退出');
    await expect(page).toHaveURL('/login');

    // Step 3: Login with the same credentials
    await loginAccount(page, account);

    await expect(page).toHaveURL('/');
    await expect(page.locator(`text=你好, ${account.username}`)).toBeVisible();
  });
});
