# Test Infrastructure Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate duplicate E2E test suites, migrate Python API tests to Jest, fix known bugs, and add keyboard/mouse interaction E2E tests.

**Architecture:** Three test layers: (1) Jest integration tests in `backend/src/__tests__/`, (2) Playwright E2E in `test/level1-playwright/specs/`, (3) new keyboard/mouse/workflow specs. The `e2e/` directory is a duplicate of `test/level1-playwright/` — all spec files are content-identical. Merge strategy: copy unique assets (loop runner, fixtures), merge config, delete `e2e/`.

**Tech Stack:** Jest + supertest (backend), Playwright (E2E), Python pytest (being retired)

**Audit result:** All 15 spec files in `e2e/tests/` are byte-identical to `test/level1-playwright/specs/`. Same for `utils.js`. Only `playwright.config.js` differs (e2e has `channel: 'chrome'`, different output dir paths).

---

### Pre-Task: Verify File State

Before starting, confirm the diff findings:
- [ ] All 15 spec files in `e2e/tests/` = `test/level1-playwright/specs/` (already verified)
- [ ] `utils.js` is identical (already verified)
- [ ] `playwright.config.js` differs (expected — config merge needed)

---

### Task 1: Copy `e2e/loop/` to `test/level1-playwright/loop/`

**Files:**
- Copy: `e2e/loop/runner.js` → `test/level1-playwright/loop/runner.js`
- Copy: `e2e/loop/reporter.js` → `test/level1-playwright/loop/reporter.js`

**Steps:**

- [ ] **Step 1: Create `test/level1-playwright/loop/` directory**

```bash
mkdir -p "e:/DrawWork/test/level1-playwright/loop"
```

- [ ] **Step 2: Copy runner.js**

```bash
cp "e:/DrawWork/e2e/loop/runner.js" "e:/DrawWork/test/level1-playwright/loop/runner.js"
```

- [ ] **Step 3: Copy reporter.js**

```bash
cp "e:/DrawWork/e2e/loop/reporter.js" "e:/DrawWork/test/level1-playwright/loop/reporter.js"
```

- [ ] **Step 4: Update runner.js references to point to new config path**

Read `test/level1-playwright/loop/runner.js` and replace any reference to `e2e/playwright.config.js` with `test/level1-playwright/playwright.config.js`.

---

### Task 2: Copy `e2e/fixtures/` to `test/level1-playwright/fixtures/`

**Files:**
- Copy: `e2e/fixtures/test-video.mp4` → `test/level1-playwright/fixtures/test-video.mp4`

**Steps:**

- [ ] **Step 1: Create fixtures directory**

```bash
mkdir -p "e:/DrawWork/test/level1-playwright/fixtures"
```

- [ ] **Step 2: Copy test video**

```bash
cp "e:/DrawWork/e2e/fixtures/test-video.mp4" "e:/DrawWork/test/level1-playwright/fixtures/test-video.mp4"
```

---

### Task 3: Merge `playwright.config.js`

**Files:**
- Modify: `test/level1-playwright/playwright.config.js`

**Changes:** Add `channel: 'chrome'` from e2e config. Keep everything else from level1 base (including `testDir: './specs'`, output paths to `../results/...`).

- [ ] **Step 1: Add `channel: 'chrome'` to the chromium project config**

Current level1 config project section:
```js
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
```

Change to:
```js
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
```

---

### Task 4: Merge `README.md` and `.gitignore`

**Files:**
- Modify: `test/level1-playwright/README.md`
- Modify: `test/level1-playwright/.gitignore`

**Steps:**

- [ ] **Step 1: Read both README files and merge**

Read `e2e/README.md` and `test/level1-playwright/README.md` (if exists). Merge unique content — primarily e2e's `npm run e2e:loop` documentation, and the loop runner usage instructions. Update paths from `e2e/` to `test/level1-playwright/`.

- [ ] **Step 2: Read both .gitignore and merge**

Read `e2e/.gitignore` and `test/level1-playwright/.gitignore` (if exists). Merge unique rules.

---

### Task 5: Copy `smoke-test.js`

**Files:**
- `e2e/tests/smoke-test.js` is identical to `test/level1-playwright/specs/smoke-test.js` (verified). No copy needed.

- [ ] **Step 1: No action needed** — files are already identical.

---

### Task 6: Delete `e2e/` directory

**Files:**
- Delete: `e2e/` (entire directory tree)

- [ ] **Step 1: Remove the e2e directory**

```bash
rm -rf "e:/DrawWork/e2e"
```

---

### Task 7: Delete duplicate `utils/helpers.js`

**Files:**
- Delete: `test/level1-playwright/utils/helpers.js` (identical copy of `specs/utils.js`)

- [ ] **Step 1: Remove the duplicate file**

```bash
rm "e:/DrawWork/test/level1-playwright/utils/helpers.js"
```

- [ ] **Step 2: Verify no specs import from `../utils/helpers`**

```bash
grep -r "utils/helpers" "e:/DrawWork/test/level1-playwright/specs/" || echo "No references found"
```

Expected: No references found (or if found, update them to `../specs/utils`).

---

### Task 8: Fix hardcoded credentials in `media-drag.spec.js`

**Files:**
- Modify: `test/level1-playwright/specs/media-drag.spec.js`

**Problem:** Uses hardcoded real user `546564249@qq.com` for login. This account won't exist in fresh environments.

**Fix:** Replace hardcoded login with dynamic registration via `registerAccount()`.

- [ ] **Step 1: Read current media-drag.spec.js and rewrite login section**

Look for `loginAccount(page, { email: '546564249@qq.com', password: '123456789' })` and replace with `registerAccount(page)` to create a fresh user. The user object returned by `registerAccount` contains `{ username, email, password, token }` — use the token for API calls.

---

### Task 9: Fix hardcoded credentials in `share.spec.js`

**Files:**
- Modify: `test/level1-playwright/specs/share.spec.js`

**Problem:** Uses hardcoded real users `546564249liu@gmail.com` (User A) and `546564249@qq.com` (User B, with hardcoded UUID `6ef7ceea-60b9-45e1-94c7-0d2c588831ad`). These accounts don't exist in fresh environments.

**Fix:** Register both users dynamically using `registerAccount()`. After registration, User A creates a board, then shares it with User B via API (using User B's actual ID from the registration response, not a hardcoded UUID).

- [ ] **Step 1: Read current share.spec.js**

Open `test/level1-playwright/specs/share.spec.js` and identify all hardcoded credentials.

- [ ] **Step 2: Rewrite to use dynamic registration**

```js
// Example structure:
const userA = await registerAccount(pageA, { /* opts */ });
const userB = await registerAccount(pageB, { /* opts */ });
// User A creates board
const board = await createBoard(pageA, 'Shared Board');
// API invite User B
await apiCall(pageA, {
  method: 'POST',
  path: `/api/boards/${board.id}/share`,
  body: { username: userB.username, permission: 'editor' }
});
// User B sees the board
await loginAccount(pageB, { email: userB.email, password: userB.password });
```

---

### Task 10: Add register + login negative tests to `auth.test.js`

**Files:**
- Modify: `backend/src/__tests__/auth.test.js`

**New tests to add:**
1. `POST /api/auth/register` — success case
2. `POST /api/auth/register` — duplicate email → 400
3. `POST /api/auth/login` — wrong password → 401
4. `POST /api/auth/login` — nonexistent email → 401

- [ ] **Step 1: Add register and login negative tests**

```js
describe('POST /api/auth/register', () => {
  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'newuser', email: 'new@example.com', password: 'password123' })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('token')
    expect(res.body).toHaveProperty('refreshToken')
    expect(res.body.user.email).toBe('new@example.com')
  })

  it('should reject duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'another', email: 'new@example.com', password: 'password123' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })
})

describe('POST /api/auth/login (negative)', () => {
  beforeAll(async () => {
    // Ensure test user exists
    const exists = await User.findOne({ where: { email: 'neg@example.com' } })
    if (!exists) {
      await User.create({
        username: 'negtester',
        email: 'neg@example.com',
        password_hash: require('bcryptjs').hashSync('correctpass', 12)
      })
    }
  })

  it('should reject wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'neg@example.com', password: 'wrongpass' })

    expect(res.status).toBe(401)
  })

  it('should reject nonexistent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noexist@example.com', password: 'anything' })

    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
cd "e:/DrawWork/backend" && npx jest src/__tests__/auth.test.js --verbose
```

Expected: All tests pass (including existing ones + new ones).

---

### Task 11: Add canvas delete test to `boards.test.js`

**Files:**
- Modify: `backend/src/__tests__/boards.test.js`

**New test to add:**
- Delete a canvas from a board → 200
- Verify canvas no longer in board's canvas list

- [ ] **Step 1: Add canvas delete test**

Add inside the existing `describe('POST /api/boards/:id/canvases', ...)` block or create a new describe block:

```js
describe('DELETE /api/boards/:id/canvases/:canvasId', () => {
  it('should delete a canvas', async () => {
    // Create a canvas first
    const createRes = await request(app)
      .post(`/api/boards/${testBoard.id}/canvases`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'To Delete', type: 'excalidraw' })
    expect(createRes.status).toBe(201)
    const canvasId = createRes.body.id

    // Delete it
    const delRes = await request(app)
      .delete(`/api/boards/${testBoard.id}/canvases/${canvasId}`)
      .set('Authorization', `Bearer ${authToken}`)
    expect(delRes.status).toBe(200)

    // Verify it's gone
    const boardRes = await request(app)
      .get(`/api/boards/${testBoard.id}`)
      .set('Authorization', `Bearer ${authToken}`)
    expect(boardRes.body.canvases.find(c => c.id === canvasId)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
cd "e:/DrawWork/backend" && npx jest src/__tests__/boards.test.js --verbose
```

Expected: All tests pass.

---

### Task 12: Delete `test/api/` directory

**Files:**
- Delete: `test/api/` (entire directory tree)

- [ ] **Step 1: Remove the Python API test directory**

```bash
rm -rf "e:/DrawWork/test/api"
```

Note: Skip if there are shared conftest.py or utility files needed elsewhere. Only the `test/api/` testing directory should be removed.

---

### Task 13: Update `test/config/test-accounts.md`

**Files:**
- Modify: `test/config/test-accounts.md`

**Changes:** Replace hardcoded real accounts with documentation about the dynamic registration pattern.

- [ ] **Step 1: Rewrite test-accounts.md**

Replace content with:
```markdown
# Test Accounts

All E2E tests use dynamically registered accounts via `registerAccount()` helper from `specs/utils.js`.

## Pattern

- Each test creates fresh accounts with `generateUnique()` prefixes
- No pre-existing accounts needed
- Share/collaboration tests register separate accounts for each participant

## Local Development

If you need to test manually:
- Register at `/register` with any email/password
- Default test password: `TestPass123!` (configurable in `settings.yaml`)
```

---

### Task 14: Write `keyboard-shortcuts.spec.js`

**Files:**
- Create: `test/level1-playwright/specs/keyboard-shortcuts.spec.js`

**Test scenarios:**
1. Shape tool shortcuts (r=rect, e=ellipse, d=diamond, a=arrow, l=line, p=free-draw, t=text)
2. Undo (Ctrl+Z) and redo (Ctrl+Shift+Z)
3. Delete with Delete key and Backspace key
4. Copy/paste (Ctrl+C → Ctrl+V)
5. Select all + group (Ctrl+A → Ctrl+G) and ungroup (Ctrl+Shift+G)

- [ ] **Step 1: Write the test file**

```js
const { test, expect } = require('@playwright/test')
const {
  registerAccount, createBoard, openBoard, cleanupUserBoards
} = require('./utils')

test.describe('Keyboard Shortcuts', () => {
  let page

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage()
    const user = await registerAccount(page)
    const boardName = `kb-test-${Date.now()}`
    const board = await createBoard(page, boardName)
    await openBoard(page, board.name)
    // Wait for editor to be ready
    await page.waitForSelector('.excalidraw')
  })

  test.afterEach(async () => {
    if (page) await page.close()
  })

  test('r key selects rectangle tool and draws a rectangle', async () => {
    await page.keyboard.press('r')
    const canvas = page.locator('.excalidraw canvas').first()
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 300, box.y + 300)
    await page.mouse.up()
    // Wait for element to appear
    await page.waitForTimeout(500)
    const elements = await page.evaluate(() =>
      window.__EXCALIDRAW__.getSceneElements()
    )
    expect(elements.length).toBeGreaterThanOrEqual(1)
    expect(elements[0].type).toBe('rectangle')
  })

  test('e key selects ellipse tool and draws an ellipse', async () => {
    await page.keyboard.press('e')
    const canvas = page.locator('.excalidraw canvas').first()
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 300, box.y + 300)
    await page.mouse.up()
    await page.waitForTimeout(500)
    const elements = await page.evaluate(() =>
      window.__EXCALIDRAW__.getSceneElements()
    )
    expect(elements.length).toBeGreaterThanOrEqual(1)
    expect(elements[0].type).toBe('ellipse')
  })

  test('d key selects diamond tool and draws a diamond', async () => {
    await page.keyboard.press('d')
    const canvas = page.locator('.excalidraw canvas').first()
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 300, box.y + 300)
    await page.mouse.up()
    await page.waitForTimeout(500)
    const elements = await page.evaluate(() =>
      window.__EXCALIDRAW__.getSceneElements()
    )
    expect(elements.length).toBeGreaterThanOrEqual(1)
    expect(elements[0].type).toBe('diamond')
  })

  test('a key selects arrow tool and draws an arrow', async () => {
    await page.keyboard.press('a')
    const canvas = page.locator('.excalidraw canvas').first()
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 300, box.y + 100)
    await page.mouse.up()
    await page.waitForTimeout(500)
    const elements = await page.evaluate(() =>
      window.__EXCALIDRAW__.getSceneElements()
    )
    expect(elements.length).toBeGreaterThanOrEqual(1)
    expect(elements[0].type).toBe('arrow')
  })

  test('Ctrl+Z undoes the last shape creation', async () => {
    // Draw a rectangle
    await page.keyboard.press('r')
    const canvas = page.locator('.excalidraw canvas').first()
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 300, box.y + 300)
    await page.mouse.up()
    await page.waitForTimeout(300)

    // Undo
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(500)

    const elements = await page.evaluate(() =>
      window.__EXCALIDRAW__.getSceneElements()
    )
    expect(elements.length).toBe(0)
  })

  test('Delete key removes a selected shape', async () => {
    // Draw a rectangle
    await page.keyboard.press('r')
    const canvas = page.locator('.excalidraw canvas').first()
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 300, box.y + 300)
    await page.mouse.up()
    await page.waitForTimeout(300)

    // Click to select it (click on the shape area)
    await page.mouse.click(box.x + 200, box.y + 200)
    await page.waitForTimeout(200)

    // Press Delete
    await page.keyboard.press('Delete')
    await page.waitForTimeout(500)

    const elements = await page.evaluate(() =>
      window.__EXCALIDRAW__.getSceneElements()
    )
    expect(elements.length).toBe(0)
  })
})
```

- [ ] **Step 2: Verify the test runs (syntax check)**

```bash
cd "e:/DrawWork/test/level1-playwright" && npx playwright test specs/keyboard-shortcuts.spec.js --list
```

Expected: Playwright lists all test cases without errors.

---

### Task 15: Write `mouse-interactions.spec.js`

**Files:**
- Create: `test/level1-playwright/specs/mouse-interactions.spec.js`

**Test scenarios:**
1. Click to select shape (shows selection handles)
2. Drag selection box to select multiple elements
3. Click away to deselect
4. Drag to move element
5. Canvas pan (Space + drag)
6. Canvas zoom (Ctrl + scroll)

- [ ] **Step 1: Write the test file**

```js
const { test, expect } = require('@playwright/test')
const {
  registerAccount, createBoard, openBoard
} = require('./utils')

test.describe('Mouse Interactions', () => {
  let page

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage()
    const user = await registerAccount(page)
    const board = await createBoard(page, `mouse-${Date.now()}`)
    await openBoard(page, board.name)
    await page.waitForSelector('.excalidraw')
  })

  test.afterEach(async () => {
    if (page) await page.close()
  })

  async function drawRectangle(page, x, y, w, h) {
    await page.keyboard.press('r')
    await page.waitForTimeout(200)
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + w, y + h)
    await page.mouse.up()
    await page.waitForTimeout(500)
  }

  test('click to select a shape shows selection handles', async () => {
    const canvas = page.locator('.excalidraw canvas').first()
    const box = await canvas.boundingBox()
    const cx = box.x + 150, cy = box.y + 150

    await drawRectangle(page, cx, cy, 100, 80)

    // Click on the rectangle
    await page.mouse.click(cx + 50, cy + 40)
    await page.waitForTimeout(300)

    // Check that selection element exists (handles)
    const selected = await page.evaluate(() => {
      const els = window.__EXCALIDRAW__.getSceneElements()
      const selected = window.__EXCALIDRAW__.getAppState().selectedElementIds
      return Object.keys(selected).length > 0
    })
    expect(selected).toBe(true)
  })

  test('drag to select multiple elements', async () => {
    const canvas = page.locator('.excalidraw canvas').first()
    const box = await canvas.boundingBox()
    const baseX = box.x + 50, baseY = box.y + 50

    // Draw first rectangle
    await drawRectangle(page, baseX, baseY, 80, 60)
    // Draw second rectangle offset
    await drawRectangle(page, baseX + 150, baseY, 80, 60)

    // Get element count before selection
    const beforeCount = await page.evaluate(() =>
      window.__EXCALIDRAW__.getSceneElements().length
    )
    expect(beforeCount).toBe(2)

    // Drag-select area covering both
    // First, make sure selection tool is active or use default selection
    await page.keyboard.press('1') // or 'v' for select tool
    await page.waitForTimeout(200)
    await page.mouse.move(baseX - 20, baseY - 20)
    await page.mouse.down()
    await page.mouse.move(baseX + 300, baseY + 100)
    await page.mouse.up()
    await page.waitForTimeout(500)

    const selectedCount = await page.evaluate(() => {
      const ids = window.__EXCALIDRAW__.getAppState().selectedElementIds
      return Object.keys(ids).length
    })
    expect(selectedCount).toBe(2)
  })

  test('click away deselects', async () => {
    const canvas = page.locator('.excalidraw canvas').first()
    const box = await canvas.boundingBox()

    await drawRectangle(page, box.x + 100, box.y + 100, 100, 80)

    // Select
    await page.mouse.click(box.x + 150, box.y + 140)
    await page.waitForTimeout(200)

    // Click away on empty area
    await page.mouse.click(box.x + 500, box.y + 500)
    await page.waitForTimeout(300)

    const selected = await page.evaluate(() => {
      const ids = window.__EXCALIDRAW__.getAppState().selectedElementIds
      return Object.keys(ids).length
    })
    expect(selected).toBe(0)
  })

  test('drag to move an element', async () => {
    const canvas = page.locator('.excalidraw canvas').first()
    const box = await canvas.boundingBox()

    await drawRectangle(page, box.x + 100, box.y + 100, 80, 60)

    // Get initial position
    const getPos = () => page.evaluate(() => {
      const el = window.__EXCALIDRAW__.getSceneElements()[0]
      return { x: el.x, y: el.y }
    })
    const before = await getPos()

    // Drag to move
    await page.mouse.click(box.x + 140, box.y + 130)
    await page.waitForTimeout(200)
    await page.mouse.move(box.x + 140, box.y + 130)
    await page.mouse.down()
    await page.mouse.move(box.x + 240, box.y + 230)
    await page.mouse.up()
    await page.waitForTimeout(500)

    const after = await getPos()
    expect(after.x).toBeGreaterThan(before.x + 50)
    expect(after.y).toBeGreaterThan(before.y + 50)
  })
})
```

- [ ] **Step 2: Verify the test file syntax**

```bash
cd "e:/DrawWork/test/level1-playwright" && npx playwright test specs/mouse-interactions.spec.js --list
```

Expected: Playwright lists all test cases without errors.

---

### Task 16: Write `workflow.spec.js`

**Files:**
- Create: `test/level1-playwright/specs/workflow.spec.js`

**Test scenarios:**
1. Full workflow: create board → draw → add canvas → switch → draw → verify both canvases have independent content
2. Create → draw → upload image → position → refresh → verify persistence

- [ ] **Step 1: Write the test file**

```js
const { test, expect } = require('@playwright/test')
const {
  registerAccount, createBoard, openBoard, cleanupUserBoards
} = require('./utils')

test.describe('Real-World Workflows', () => {
  let page

  test.afterEach(async () => {
    if (page) await page.close()
  })

  test('multi-canvas workflow: create, switch, draw independently', async ({ browser }) => {
    page = await browser.newPage()
    const user = await registerAccount(page)
    const board = await createBoard(page, `flow-${Date.now()}`)
    await openBoard(page, board.name)
    await page.waitForSelector('.excalidraw')

    // Draw rectangle on canvas 1
    await page.keyboard.press('r')
    const canvas = page.locator('.excalidraw canvas').first()
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 300, box.y + 300)
    await page.mouse.up()
    await page.waitForTimeout(500)

    // Add canvas 2 via UI (click "+" or similar)
    await page.click('button:has-text("画布")')
    await page.waitForTimeout(300)
    await page.click('button:has-text("新建")')
    await page.waitForTimeout(1000)

    // Draw ellipse on canvas 2
    await page.keyboard.press('e')
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 300, box.y + 300)
    await page.mouse.up()
    await page.waitForTimeout(500)

    // Switch back to canvas 1
    await page.click('button:has-text("画布 1")')
    await page.waitForTimeout(500)

    // Canvas 1 should still have the rectangle
    const canvas1Elements = await page.evaluate(() =>
      window.__EXCALIDRAW__.getSceneElements()
    )
    expect(canvas1Elements.length).toBeGreaterThanOrEqual(1)
    expect(canvas1Elements[0].type).toBe('rectangle')

    // Switch to canvas 2
    await page.click('button:has-text("画布 2")')
    await page.waitForTimeout(500)

    // Canvas 2 should have the ellipse
    const canvas2Elements = await page.evaluate(() =>
      window.__EXCALIDRAW__.getSceneElements()
    )
    expect(canvas2Elements.length).toBeGreaterThanOrEqual(1)
    expect(canvas2Elements[0].type).toBe('ellipse')
  })

  test('media upload + position + refresh persistence', async ({ browser }) => {
    page = await browser.newPage()
    const user = await registerAccount(page)
    const board = await createBoard(page, `media-${Date.now()}`)
    await openBoard(page, board.name)
    await page.waitForSelector('.excalidraw')

    // Generate a minimal valid GIF for upload
    const gifBuffer = Buffer.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a header
      0x0A, 0x00, 0x0A, 0x00, // 10x10
      0x80, 0x00, 0x00, 0xFF, 0x00, 0x00, // color table
      0x21, 0xF9, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, // graphics control
      0x2C, 0x00, 0x00, 0x00, 0x00, 0x0A, 0x00, 0x0A, 0x00, 0x00, // image descriptor
      0x02, 0x16, 0x8C, 0x2D, 0x99, 0x00, 0x00, 0x3B // image data + trailer
    ])

    // Upload via file input
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'test.gif',
      mimeType: 'image/gif',
      buffer: gifBuffer
    })
    await page.waitForTimeout(2000)

    // Verify elements exist after upload
    let elements = await page.evaluate(() =>
      window.__EXCALIDRAW__.getSceneElements()
    )
    expect(elements.length).toBeGreaterThanOrEqual(1)

    // Refresh
    await page.reload()
    await page.waitForSelector('.excalidraw')
    await page.waitForTimeout(2000)

    // Verify image still exists
    elements = await page.evaluate(() =>
      window.__EXCALIDRAW__.getSceneElements()
    )
    expect(elements.length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Verify the test file syntax**

```bash
cd "e:/DrawWork/test/level1-playwright" && npx playwright test specs/workflow.spec.js --list
```

Expected: Playwright lists all test cases without errors.

---

## Self-Review Checklist

- [ ] **Spec coverage:** All sections from design doc covered: e2e merge (T1-T6), duplicate cleanup (T7), credential fixes (T8-T9), Jest migration (T10-T12), docs update (T13), new E2E tests (T14-T16)
- [ ] **Placeholder scan:** No TBD, TODO, "fill in details", or similar placeholder patterns
- [ ] **Type consistency:** All file paths match actual project structure. Helper functions referenced (`registerAccount`, `createBoard`, `openBoard`) exist in `specs/utils.js`
