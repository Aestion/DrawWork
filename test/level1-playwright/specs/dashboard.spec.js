const { test, expect } = require('@playwright/test');
const { apiCall, generateUnique, getUserId, loginAccount, registerAccount, cleanupUserBoards } = require('./utils');

async function createBoardByApi(page, token, name, extra = {}) {
  const response = await page.evaluate(async ({ token, name, extra }) => {
    const res = await fetch('/api/boards', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name, ...extra })
    });
    return { ok: res.ok, status: res.status, body: await res.json() };
  }, { token, name, extra });

  expect(response.ok, `board create failed with ${response.status}`).toBeTruthy();
  await page.reload();
  await expect(page.locator(`text=${name}`)).toBeVisible();
  return response.body;
}

test.describe('Dashboard', () => {
  test('user can create a board and see it in the owned group', async ({ page }) => {
    const account = await registerAccount(page);
    const boardName = `Board ${generateUnique()}`;

    await createBoardByApi(page, account.token, boardName);

    await expect(page.getByRole('heading', { name: '我的画板' })).toBeVisible();
    await expect(page.locator('[data-testid="board-group-owned"]', { hasText: boardName })).toBeVisible();

    await cleanupUserBoards(page, account.token);
  });

  test('user can delete a board', async ({ page }) => {
    const account = await registerAccount(page);
    const boardName = `Delete Me ${generateUnique()}`;

    await createBoardByApi(page, account.token, boardName);

    page.on('dialog', dialog => dialog.accept());
    const boardCard = page.locator('[data-testid="board-group-owned"] div.cursor-pointer', { hasText: boardName });
    await boardCard.getByRole('button', { name: '删除' }).click();

    await expect(page.locator(`text=${boardName}`)).not.toBeVisible();

    await cleanupUserBoards(page, account.token);
  });

  test('user can switch dashboard between grid and list view across sessions', async ({ browser, page }) => {
    const account = await registerAccount(page);
    const boardName = `List View ${generateUnique()}`;

    await createBoardByApi(page, account.token, boardName);

    await expect(page.locator('[data-testid="board-group-owned"] .grid')).toBeVisible();

    await page.getByRole('button', { name: '列表视图' }).click();
    await expect(page.locator('[data-testid="board-group-owned"] .space-y-3')).toBeVisible();
    await expect(page.locator('[data-testid="board-group-owned"] .grid')).toHaveCount(0);
    await expect(page.locator(`text=${boardName}`)).toBeVisible();

    await page.reload();
    await expect(page.locator('[data-testid="board-group-owned"] .space-y-3')).toBeVisible();
    await expect(page.getByRole('button', { name: '列表视图' })).toHaveClass(/bg-blue-50/);

    const secondPage = await browser.newPage();
    await loginAccount(secondPage, account);
    await expect(secondPage.locator('[data-testid="board-group-owned"] .space-y-3')).toBeVisible();
    await expect(secondPage.getByRole('button', { name: '列表视图' })).toHaveClass(/bg-blue-50/);

    await page.getByRole('button', { name: '大图视图' }).click();
    await expect(page.locator('[data-testid="board-group-owned"] .grid')).toBeVisible();

    await cleanupUserBoards(page, account.token);
    await secondPage.close();
  });

  test('user can sort owned boards by name across sessions', async ({ page }) => {
    const account = await registerAccount(page);
    const beta = `Beta ${generateUnique()}`;
    const alpha = `Alpha ${generateUnique()}`;

    await createBoardByApi(page, account.token, beta);
    await createBoardByApi(page, account.token, alpha);

    const ownedGroup = page.locator('[data-testid="board-group-owned"]');
    await page.getByLabel('画板排序').selectOption('name');

    await expect.poll(async () => {
      const names = await ownedGroup.locator('h3').allTextContents();
      return names.filter(name => name.includes(alpha) || name.includes(beta));
    }).toEqual([alpha, beta]);

    await page.reload();
    await expect.poll(async () => {
      const names = await ownedGroup.locator('h3').allTextContents();
      return names.filter(name => name.includes(alpha) || name.includes(beta));
    }).toEqual([alpha, beta]);

    await cleanupUserBoards(page, account.token);
  });

  test('user sees shared and public boards in separate groups', async ({ browser }) => {
    const ownerPage = await browser.newPage();
    const viewerPage = await browser.newPage();

    const owner = await registerAccount(ownerPage);
    const sharedName = `Shared ${generateUnique()}`;
    const publicName = `Public ${generateUnique()}`;
    const sharedBoard = await createBoardByApi(ownerPage, owner.token, sharedName);
    await createBoardByApi(ownerPage, owner.token, publicName, { is_public: true });

    const viewer = await registerAccount(viewerPage);
    const viewerId = await getUserId(viewerPage, viewer.token);
    const shareResult = await apiCall(ownerPage, {
      method: 'POST',
      path: `/api/boards/${sharedBoard.id}/shares`,
      body: { user_id: viewerId, permission: 'viewer' },
      token: owner.token
    });
    expect(shareResult.ok, `share failed with ${shareResult.status}`).toBeTruthy();

    await viewerPage.reload();
    await expect(viewerPage.getByRole('heading', { name: '别人分享给我' })).toBeVisible();
    await expect(viewerPage.getByRole('heading', { name: '内网共享' })).toBeVisible();
    await expect(viewerPage.locator('[data-testid="board-group-shared"]', { hasText: sharedName })).toBeVisible();
    await expect(viewerPage.locator('[data-testid="board-group-public"]', { hasText: publicName })).toBeVisible();

    await cleanupUserBoards(ownerPage, owner.token);
    await cleanupUserBoards(viewerPage, viewer.token);
    await ownerPage.close();
    await viewerPage.close();
  });
});
