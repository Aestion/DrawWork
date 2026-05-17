const { test, expect } = require('@playwright/test');

const { generateUnique, registerAccount, cleanupUserBoards } = require('./utils');

test.describe('Security', () => {
  test.use({ actionTimeout: 15000, timeout: 30000 });

  // ═══════════════════════════════════════════════════
  // XSS — Board Name
  // ═══════════════════════════════════════════════════

  test('board name with XSS script tag is escaped, not executed', async ({ page }) => {
    const account = await registerAccount(page);
    const xssPayload = '<script>window.xssExecuted=true</script>';

    // Create board with XSS name
    await page.click('text=新建画板');
    await page.fill('#board-name', xssPayload);
    await page.click('button[type="submit"]');

    // Wait for board to appear
    await expect(page.locator(`text=${xssPayload}`)).toBeVisible({ timeout: 10000 });

    // Verify script didn't execute
    const xssFlag = await page.evaluate(() => window.xssExecuted);
    expect(xssFlag).toBeUndefined();

    await cleanupUserBoards(page, account.token);
  });

  test('board name with event handler is not executed', async ({ page }) => {
    const account = await registerAccount(page);
    const xssPayload = 'Test<img src=x onerror="window.xssImg=true">';

    await page.click('text=新建画板');
    await page.fill('#board-name', xssPayload);
    await page.click('button[type="submit"]');

    // Verify event didn't fire
    const xssFlag = await page.evaluate(() => window.xssImg);
    expect(xssFlag).toBeUndefined();

    await cleanupUserBoards(page, account.token);
  });

  // ═══════════════════════════════════════════════════
  // XSS — User Profile (registration)
  // ═══════════════════════════════════════════════════

  test('HTML injection in form input is not reflected in page DOM', async ({ page }) => {
    // Check that the page's visible DOM doesn't render injected HTML tags
    const payload = 'test<b>BOLD</b><script>void 0</script>';

    await page.goto('/login');
    await page.fill('input[type="email"]', payload);
    await page.fill('input[type="password"]', 'any');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    const bodyHTML = await page.evaluate(() => document.body.innerHTML);
    // The payload string might appear, but should be escaped (not rendered as HTML)
    // '<b>BOLD</b>' should only appear if properly HTML-escaped
    // If it appears unescaped and renders bold text, that's a vulnerability
    expect(bodyHTML).not.toContain('<b>BOLD</b>');
    expect(bodyHTML).not.toContain('<script>void 0</script>');
  });

  // ═══════════════════════════════════════════════════
  // Authorization — API-level boundary
  // ═══════════════════════════════════════════════════

  test('user cannot delete another user board via API', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // User A creates board
      const accountA = await registerAccount(pageA);
      await pageA.click('text=新建画板');
      await pageA.fill('#board-name', 'Protected Board');
      await pageA.click('button[type="submit"]');
      await expect(pageA.locator('text=Protected Board')).toBeVisible();

      // Enter the board to get its ID from the URL
      await pageA.locator('.grid > div', { hasText: 'Protected Board' }).click();
      await expect(pageA.locator('.excalidraw')).toBeVisible({ timeout: 10000 });

      const boardUrl = pageA.url();
      const boardId = boardUrl.match(/\/board\/([a-f0-9-]+)/)?.[1];
      expect(boardId).toBeTruthy();

      // Go back to dashboard for later
      await pageA.goto('/');

      // User B tries to delete via API
      const accountB = await registerAccount(pageB);
      const deleteResult = await pageB.evaluate(async ({ boardId, token }) => {
        const res = await fetch(`/api/boards/${boardId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        return { status: res.status };
      }, { boardId, token: accountB.token });

      // Should be unauthorized
      expect(deleteResult.status).toBeGreaterThanOrEqual(400);
      expect(deleteResult.status).toBeLessThan(500);

    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // ═══════════════════════════════════════════════════
  // Rate limiting / rapid request protection (bonus)
  // ═══════════════════════════════════════════════════

  test('rapid repeated login attempts do not crash the app', async ({ page }) => {
    // Register one account
    const account = await registerAccount(page);

    // Logout
    await page.click('text=退出');
    await expect(page).toHaveURL('/login');

    // Rapid login attempts — should handle gracefully
    for (let i = 0; i < 10; i++) {
      await page.goto('/login');
      await page.fill('input[type="email"]', account.email);
      await page.fill('input[type="password"]', 'wrongpassword');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(200);
    }

    // App should still be responsive
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});
