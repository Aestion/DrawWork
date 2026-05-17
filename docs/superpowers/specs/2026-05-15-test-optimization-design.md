# Test Infrastructure Optimization Design

> **Date:** 2026-05-15
> **Status:** Approved
> **Goal:** Consolidate duplicate test suites, migrate API tests to Jest, fix bugs, and add keyboard/mouse interaction tests.

---

## 1. Merge `e2e/` into `test/level1-playwright/`

### Motivation

`e2e/` and `test/level1-playwright/` are two nearly identical Playwright E2E test suites that diverged from a common origin. Both contain the same spec files (auth, dashboard, editor, collaboration, media, etc.) and the same 167-line `utils.js` helper. Maintaining both creates confusion and duplication.

### File Map

| Source (`e2e/`) | Target (`test/level1-playwright/`) | Action |
|---|---|---|
| `loop/runner.js` | `loop/runner.js` | Copy |
| `loop/reporter.js` | `loop/reporter.js` | Copy |
| `playwright.config.js` | merge into `playwright.config.js` | Merge (keep `channel: 'chrome'`) |
| `tests/*.spec.js` | `specs/*.spec.js` | Diff-compare, keep newer |
| `tests/smoke-test.js` | `specs/smoke-test.js` | Diff-compare, keep newer |
| `tests/utils.js` | (already in `specs/utils.js`) | Remove (already identical) |
| `fixtures/test-video.mp4` | `fixtures/test-video.mp4` | Copy |
| `README.md` | `README.md` | Merge content |
| `test-accounts.md` | (moved to docs/) | Move |
| `.gitignore` | `.gitignore` | Merge rules |
| `results/`, `node_modules/`, `e2e/` | — | Skip |

### Config Merge

- Use `test/level1-playwright/playwright.config.js` as base
- Add `channel: 'chrome'` from e2e config (uses system Chrome → more realistic)
- Keep `testDir: './specs'` (already points to the specs directory)
- Keep output dirs as-is (`../results/...`)

### Post-Merge

- Delete `e2e/` directory entirely (git `rm -rf`)
- Update any references (README, docs, CI scripts) that point to `e2e/`

---

## 2. Migrate `test/api/` (Python pytest) → Jest

### Motivation

Python pytest API tests duplicate coverage already provided by Jest integration tests in `backend/src/__tests__/`. Consolidating to a single framework reduces maintenance burden and keeps all backend tests in one place.

### Coverage Analysis

| Python Test Case | Jest Already Covers? | Migrate? |
|---|---|---|
| Auth: register | ❌ No | ✅ Add to `auth.test.js` |
| Auth: login success | ✅ (implicit via login in beforeAll) | Skip |
| Auth: wrong password | ❌ No | ✅ Add to `auth.test.js` |
| Auth: nonexistent user | ❌ No | ✅ Add to `auth.test.js` |
| Boards: create with default canvas | ✅ Yes | Skip |
| Boards: create without name | ✅ Yes | Skip |
| Boards: list | ✅ Yes | Skip |
| Boards: soft delete | ✅ Yes | Skip |
| Canvases: all 4 types | ✅ Yes | Skip |
| Canvases: invalid type rejected | ✅ Yes | Skip |
| Canvases: list | ✅ Yes | Skip |
| Canvases: delete canvas | ❌ No | ✅ Add to `boards.test.js` |
| Comments: create with coordinates | ✅ Yes | Skip |
| Comments: missing content | ✅ Yes | Skip |
| Comments: list | ✅ Yes | Skip |
| Comments: reply | ✅ Yes | Skip |
| Comments: resolve (bug: missing body) | ✅ Yes (Jest sends correct body) | Skip |
| Shares: invite editor | ✅ Yes | Skip |
| Shares: non-owner blocked | ✅ Yes | Skip |
| Shares: generate token | ✅ Yes | Skip |
| Shares: remove collaborator | ✅ Yes | Skip |
| Uploads: upload PNG | ✅ Yes | Skip |
| Uploads: upload without board | ✅ Yes | Skip |
| Votes: create (bug: uses `options` field) | ✅ Yes (Jest uses correct fields) | Skip |
| Votes: submit record | ✅ Yes | Skip |
| Votes: close | ✅ Yes | Skip |
| Votes: results | ✅ Yes | Skip |

### New Jest Tests to Write

1. **`auth.test.js`** — add `POST /api/auth/register`:
   - Register with valid username/email/password → 201 + token
   - Register with duplicate email → 400
   - Register with missing fields → 400

2. **`auth.test.js`** — add `POST /api/auth/login` negative cases:
   - Login with wrong password → 401
   - Login with nonexistent email → 401

3. **`boards.test.js`** — add `DELETE /api/boards/:id/canvases/:canvasId`:
   - Delete a canvas → 200
   - Verify canvas no longer in board's canvas list

### Post-Migration

- Delete `test/api/` directory
- Remove Python dependencies from any test requirements files if they exist only for API tests

---

## 3. Fix Known Issues

### Issue 1: Duplicate `utils/helpers.js`

- **Location**: `test/level1-playwright/utils/helpers.js`
- **Problem**: Identical copy of `test/level1-playwright/specs/utils.js` (167 lines, same exports)
- **Fix**: Delete `utils/helpers.js`

### Issue 2: Hardcoded Real User Credentials

- **Files affected**:
  - `test/level1-playwright/specs/media-drag.spec.js` — uses `546564249@qq.com`
  - `test/level1-playwright/specs/share.spec.js` — uses `546564249liu@gmail.com` + `546564249@qq.com` + hardcoded UUID
- **Problem**: These accounts don't exist in fresh environments (SQLite), causing test failures
- **Fix**: Replace with dynamic registration via `registerAccount()` helper, already available in utils.js

### Issue 3: `test/config/test-accounts.md`

- **Problem**: Documents hardcoded real accounts that are environment-specific
- **Fix**: Rewrite to describe dynamic account patterns used by the test framework, remove real email addresses

### Issue 4: `test/archive/`

- **Status**: Already documented as deprecated, kept for reference
- **Action**: No change (user can decide later if they want it removed)

---

## 4. New E2E Tests — Keyboard & Mouse Interaction

### Rationale

Current E2E tests verify functional outcomes (elements exist, data persists) but don't simulate how a human actually uses the application — keyboard shortcuts, mouse drags, context menus. These are the primary failure points for real users.

### 4.1 Keyboard Shortcut Tests

Add to a new file: `test/level1-playwright/specs/keyboard-shortcuts.spec.js`

**Shape Tools** (Excalidraw standard):
| Test | Steps | Assertion |
|---|---|---|
| Rectangle tool | Press `r`, draw drag, verify shape | SVG `.excalidraw` contains rectangle element |
| Ellipse tool | Press `e`, draw drag, verify shape | SVG contains ellipse element |
| Diamond tool | Press `d`, draw drag, verify shape | SVG contains diamond element |
| Arrow tool | Press `a`, draw drag, verify shape | SVG contains arrow element |
| Line tool | Press `l`, draw drag, verify shape | SVG contains line element |
| Free-draw tool | Press `p`, draw path | SVG contains path element |
| Text tool | Press `t`, click canvas, type text | SVG contains text element |

**Undo/Redo**:
| Test | Steps | Assertion |
|---|---|---|
| Undo shape creation | Draw rectangle → `Ctrl+Z` | Rectangle removed from scene |
| Redo shape restoration | Draw rectangle → `Ctrl+Z` → `Ctrl+Shift+Z` | Rectangle reappears |
| Multiple undo | Draw 3 shapes → 2x Ctrl+Z → verify | Last 2 shapes removed, first remains |

**Delete Operations**:
| Test | Steps | Assertion |
|---|---|---|
| Delete with Delete key | Draw shape, select it, press Delete | Shape removed |
| Delete with Backspace | Draw shape, select it, press Backspace | Shape removed |

**Copy/Paste**:
| Test | Steps | Assertion |
|---|---|---|
| Copy and paste shape | Draw shape → `Ctrl+C` → `Ctrl+V` | Second shape appears (offset) |

**Select All + Group**:
| Test | Steps | Assertion |
|---|---|---|
| Select all then group | Draw 2 shapes → `Ctrl+A` → `Ctrl+G` | Single group element created |
| Ungroup | Select group → `Ctrl+Shift+G` | Two individual elements restored |

### 4.2 Mouse Interaction Tests

Add to: `test/level1-playwright/specs/mouse-interactions.spec.js`

**Selection**:
| Test | Steps | Assertion |
|---|---|---|
| Click to select | Draw shape, click on it | Shape shows selection handles |
| Drag selection box | Draw 2 shapes, drag-select area covering both | Both shapes show selection |
| Click away to deselect | Select shape, click empty canvas | Selection handles gone |

**Drag to Move**:
| Test | Steps | Assertion |
|---|---|---|
| Drag move element | Draw shape, drag it to new position | Shape at new coordinates |
| Multi-select drag | Select 2 shapes, drag together | Both at new positions |

**Canvas Pan & Zoom**:
| Test | Steps | Assertion |
|---|---|---|
| Pan canvas | Hold Space + drag canvas | Canvas scroll position changed |
| Zoom in | Ctrl + scroll up | Canvas zoom level increased |
| Zoom out | Ctrl + scroll down | Canvas zoom level decreased |
| Zoom to fit | Click zoom-to-fit button | All elements visible in viewport |

**Context Menu**:
| Test | Steps | Assertion |
|---|---|---|
| Right-click on shape | Draw shape, right-click it | Context menu appears with actions |
| Right-click on canvas | Right-click empty area | Canvas context menu appears |

### 4.3 Real-World Workflow Tests

Add to: `test/level1-playwright/specs/workflow.spec.js`

| Test | Steps | Assertion |
|---|---|---|
| Create → draw → share → comment → vote | Full flow with real UI interactions | Each step completes successfully |
| Multi-canvas workflow | Create board, add 2 canvases, draw on each, switch between them | Both canvases retain independent state |
| File upload + position + refresh | Upload image, drag to position, refresh, verify | Image at correct position after reload |

---

## 5. Implementation Order

| Phase | Task | Dependencies |
|---|---|---|
| 1 | Merge e2e/ → test/level1-playwright/ (file ops) | None |
| 2 | Delete duplicate `utils/helpers.js` | Phase 1 |
| 3 | Fix hardcoded credentials in spec files | Phase 1 |
| 4 | Write new Jest tests (auth register, canvas delete) | None |
| 5 | Delete test/api/ directory | Phase 4 |
| 6 | Update test/config/test-accounts.md | Phase 3 |
| 7 | Write keyboard-shortcuts.spec.js | Phase 1 |
| 8 | Write mouse-interactions.spec.js | Phase 1 |
| 9 | Write workflow.spec.js | Phase 7, 8 |

---

## 6. Files to Modify / Create / Delete

### Delete
- `e2e/` (entire directory tree after merge)
- `test/level1-playwright/utils/helpers.js` (duplicate)
- `test/api/` (entire directory after Jest migration)

### Create
- `test/level1-playwright/specs/keyboard-shortcuts.spec.js`
- `test/level1-playwright/specs/mouse-interactions.spec.js`
- `test/level1-playwright/specs/workflow.spec.js`

### Modify
- `test/level1-playwright/playwright.config.js` (merge `channel: 'chrome'`)
- `test/level1-playwright/README.md` (merge e2e info)
- `test/level1-playwright/.gitignore` (merge e2e rules)
- `test/level1-playwright/specs/media-drag.spec.js` (dynamic auth)
- `test/level1-playwright/specs/share.spec.js` (dynamic auth)
- `backend/src/__tests__/auth.test.js` (add register + login negative)
- `backend/src/__tests__/boards.test.js` (add canvas delete)
- `test/config/test-accounts.md` (rewrite for dynamic accounts)

### Copy
- `e2e/loop/runner.js` → `test/level1-playwright/loop/runner.js`
- `e2e/loop/reporter.js` → `test/level1-playwright/loop/reporter.js`
- `e2e/fixtures/test-video.mp4` → `test/level1-playwright/fixtures/test-video.mp4`
