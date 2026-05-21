# TencentMind Context Menu & Marker Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace TencentMindEditor's crowded top toolbar with a right-click context menu on nodes, and expand markers from 3 to 10 symbols.

**Architecture:** Add React state + event handlers for the context menu overlay (rendered inline in the component), expand `marker-icons.js` with 7 new SVGs, simplify the toolbar JSX. The menu uses DOM-based node detection via `data-node-uid` attributes on SVG elements, and manages all existing handlers unchanged.

**Tech Stack:** React (useState/useRef/useCallback), simple-mind-map library API (findNodeByUid, execCommand, getData/setNodeData), Tailwind CSS

---

### Task 1: Expand marker-icons.js with 7 new SVGs + mapping updates

**Files:**
- Modify: `frontend/src/lib/marker-icons.js`

- [ ] **Step 1: Add 7 new SVG icon definitions**

Add after `progressIcon` and before the export:

```js
const starIcon = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
  <polygon points="12,2 15,9 22,9 16,14 18,22 12,17 6,22 8,14 2,9 9,9" fill="#f1c40f"/>
</svg>`

const checkIcon = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" fill="#2ecc71"/>
  <polyline points="7,12 10,15 17,9" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

const crossIcon = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" fill="#e74c3c"/>
  <line x1="8" y1="8" x2="16" y2="16" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
  <line x1="16" y1="8" x2="8" y2="16" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
</svg>`

const ideaIcon = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" fill="#f39c12"/>
  <ellipse cx="12" cy="14" rx="4" ry="3" fill="#fff" opacity="0.9"/>
  <path d="M12 17v3M10 20h4" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M12 6v2M8.5 8.5l1.5 1.5M15.5 8.5l-1.5 1.5" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
</svg>`

const warningIcon = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2L2 22h20L12 2z" fill="#e67e22"/>
  <line x1="12" y1="9" x2="12" y2="15" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
  <circle cx="12" cy="18" r="1" fill="#fff"/>
</svg>`

const targetIcon = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" fill="#9b59b6"/>
  <circle cx="12" cy="12" r="6" fill="none" stroke="#fff" stroke-width="1.5"/>
  <circle cx="12" cy="12" r="2" fill="#fff"/>
</svg>`

const clockIcon = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" fill="#1abc9c"/>
  <circle cx="12" cy="12" r="7" fill="none" stroke="#fff" stroke-width="1.2"/>
  <line x1="12" y1="8" x2="12" y2="12" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="12" y1="12" x2="15" y2="14" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
</svg>`
```

- [ ] **Step 2: Update TENCENT_MARKER_ICONS list**

Add new icons to the `list` array after `progress`:

```js
      { name: 'star', icon: starIcon },
      { name: 'check', icon: checkIcon },
      { name: 'cross', icon: crossIcon },
      { name: 'idea', icon: ideaIcon },
      { name: 'warning', icon: warningIcon },
      { name: 'target', icon: targetIcon },
      { name: 'clock', icon: clockIcon }
```

- [ ] **Step 3: Update mapping functions**

Add new cases to `markerIdToIconKey` and `iconKeyToMarkerId`:

```js
    case 'symbol-star': return 'tencent_star'
    case 'symbol-check': return 'tencent_check'
    case 'symbol-cross': return 'tencent_cross'
    case 'symbol-idea': return 'tencent_idea'
    case 'symbol-warning': return 'tencent_warning'
    case 'symbol-target': return 'tencent_target'
    case 'symbol-clock': return 'tencent_clock'
```

And the reverse in `iconKeyToMarkerId`:

```js
    case 'tencent_star': return 'symbol-star'
    case 'tencent_check': return 'symbol-check'
    case 'tencent_cross': return 'symbol-cross'
    case 'tencent_idea': return 'symbol-idea'
    case 'tencent_warning': return 'symbol-warning'
    case 'tencent_target': return 'symbol-target'
    case 'tencent_clock': return 'symbol-clock'
```

- [ ] **Step 4: Verify**

Run: `npm run build` or check that the dev server compiles without errors.
No test to run — pure data definitions.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/marker-icons.js
git commit -m "feat: add 7 new marker SVGs (star/check/cross/idea/warning/target/clock)"
```

---

### Task 2: Add contextMenu state, refs, and event binding

**Files:**
- Modify: `frontend/src/components/Editor/TencentMindEditor.jsx`

- [ ] **Step 1: Add new state and refs** (after line 101 `const saveDataRef = useRef(null)`)

```js
  const [contextMenu, setContextMenu] = useState(null)
  const contextNodeRef = useRef(null)     // stable ref for callback closures
  const markerMenuRef = useRef(null)
  const generalizationParentRef = useRef(null)
```

Note: `contextNodeRef.current` is kept in sync with `contextMenu.node` so marker picker and menu item callbacks always have a stable node reference even during re-renders.

- [ ] **Step 2: Add contextmenu event listener in init()**

Inside the `init()` function, after the mind map is created (after `mmRef.current = mindMap` on ~line 289), add:

```js
      // Right-click context menu
      const onContextMenu = (e) => {
        let target = e.target
        while (target && !target.dataset?.nodeUid) {
          target = target.parentElement
        }
        if (!target) return
        const uid = target.dataset.nodeUid
        const node = mindMap.renderer.findNodeByUid(uid)
        if (!node) return
        e.preventDefault()
        contextNodeRef.current = node
        setContextMenu({ x: e.clientX, y: e.clientY, node })
      }
      containerRef.current.addEventListener('contextmenu', onContextMenu)
```

Store the handler ref so it can be cleaned up:

In the `return () => { ... }` cleanup, add:
```js
      containerRef.current?.removeEventListener('contextmenu', onContextMenu)
```

Also note: the `contextmenu` handler runs in the `init()` closure but `setContextMenu` is a React setter — it needs to be stable. Wrap in a ref to avoid stale closure issues:

Add near the top refs:
```js
  const setContextMenuRef = useRef(setContextMenu)
  setContextMenuRef.current = setContextMenu
```

Then use `setContextMenuRef.current(...)` inside the init closure.

- [ ] **Step 3: Add global mouseup and keydown listeners for menu dismissal**

After the contextmenu handler, add:

```js
      const onMouseUp = (e) => {
        // Only close if clicking outside the menu (handled by overlay click)
      }
      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          setContextMenuRef.current(null)
        }
      }
      document.addEventListener('keydown', onKeyDown)
```

Cleanup:
```js
      document.removeEventListener('keydown', onKeyDown)
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Editor/TencentMindEditor.jsx
git commit -m "feat: add context menu state and right-click event binding"
```

---

### Task 3: Build the context menu overlay component

**Files:**
- Modify: `frontend/src/components/Editor/TencentMindEditor.jsx`

- [ ] **Step 1: Add context menu JSX** (before the final `return` of the component, after loading check, near the toolbar return)

The context menu renders as a fixed overlay only when `contextMenu` is non-null.
**Boundary detection:** On mount, measure the menu's offsetHeight/offsetWidth and adjust `left`/`top` if it overflows the viewport. Use `useLayoutEffect` or a `ref` callback. The marker submenu also checks `left + width > window.innerWidth` and flips to `right: 0` instead.

```jsx
  {contextMenu && (
    <div
      className="fixed inset-0 z-50"
      onContextMenu={e => e.preventDefault()}
      onClick={(e) => { if (e.target === e.currentTarget) setContextMenu(null) }}
    >
      <div
        ref={menuEl => {
          if (!menuEl) return
          const rect = menuEl.getBoundingClientRect()
          if (rect.right > window.innerWidth) menuEl.style.left = (window.innerWidth - rect.width - 8) + 'px'
          if (rect.bottom > window.innerHeight) menuEl.style.top = (window.innerHeight - rect.height - 8) + 'px'
        }}
        className="absolute bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[160px] text-sm"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        onClick={e => e.stopPropagation()}
      >
        {/* 添加子节点 */}
        <ContextMenuItem onClick={() => { mmRef.current?.execCommand('INSERT_CHILD_NODE'); setContextMenu(null) }}>
          添加子节点
        </ContextMenuItem>
        {/* 添加同级 — 根节点禁用 */}
        <ContextMenuItem
          onClick={() => { mmRef.current?.execCommand('INSERT_NODE'); setContextMenu(null) }}
          disabled={contextMenu.node.isRoot}
        >
          添加同级
        </ContextMenuItem>

        <ContextMenuDivider />

        <ContextMenuItem onClick={() => { setContextMenu(null); handleAddMedia() }}>
          添加图片/视频
        </ContextMenuItem>

        <ContextMenuDivider />

        <ContextMenuItem
          onClick={() => { mmRef.current?.execCommand('ADD_GENERALIZATION'); setContextMenu(null) }}
          disabled={contextMenu.node.isRoot}
        >
          添加概要
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => { setContextMenu(null); handleRemoveGeneralization() }}
          disabled={contextMenu.node.isRoot}
        >
          删除概要
        </ContextMenuItem>
        <ContextMenuItem onClick={() => { mmRef.current?.execCommand('ADD_OUTER_FRAME', null, { strokeColor: '#0984e3', fill: 'rgba(9,132,227,0.05)' }); setContextMenu(null) }}>
          添加外框
        </ContextMenuItem>
        <ContextMenuItem onClick={() => { mmRef.current?.outerFrame?.removeActiveOuterFrame(); setContextMenu(null) }}>
          删除外框
        </ContextMenuItem>

        <ContextMenuDivider />

        <ContextMenuItem onClick={() => { mmRef.current?.associativeLine?.addLine(); setContextMenu(null) }}>
          创建关联线
        </ContextMenuItem>
        <ContextMenuItem onClick={() => { mmRef.current?.associativeLine?.removeLine(); setContextMenu(null) }}>
          删除关联线
        </ContextMenuItem>

        <ContextMenuDivider />

        {/* 标记子菜单 */}
        <div className="relative">
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center justify-between"
            onMouseEnter={() => markerMenuRef.current?.classList.remove('hidden')}
            onMouseLeave={(e) => {
              // Delay hiding so user can move into submenu
              setTimeout(() => {
                if (markerMenuRef.current && !markerMenuRef.current.matches(':hover')) {
                  markerMenuRef.current.classList.add('hidden')
                }
              }, 200)
            }}
            onClick={(e) => {
              const menu = markerMenuRef.current
              if (menu) menu.classList.toggle('hidden')
            }}
          >
            <span>标记</span>
            <span className="text-gray-400">▸</span>
          </button>
          {/* Marker picker rendered by Task 4 */}
          <div
            ref={markerMenuRef}
            className="hidden absolute left-full top-0 ml-1 bg-white rounded-lg shadow-xl border border-gray-200 p-2"
            onMouseEnter={() => markerMenuRef.current?.classList.remove('hidden')}
            onMouseLeave={() => markerMenuRef.current?.classList.add('hidden')}
          >
            {/* marker grid will go here */}
          </div>
        </div>
      </div>
    </div>
  )}
```

Define helper components at the bottom of the file (before export) or as local consts:

```jsx
const ContextMenuItem = ({ onClick, disabled, children }) => (
  <button
    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${
      disabled
        ? 'text-gray-300 cursor-not-allowed'
        : 'text-gray-700 hover:bg-gray-100'
    }`}
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
  >
    {children}
  </button>
)

const ContextMenuDivider = () => (
  <div className="h-px bg-gray-200 my-1" />
)
```

- [ ] **Step 2: Verify absence of import issues**

Run: `npx eslint frontend/src/components/Editor/TencentMindEditor.jsx` (or check in dev server for no errors)
Expected: No lint errors, menu renders without console errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Editor/TencentMindEditor.jsx
git commit -m "feat: add context menu overlay with all node operations"
```

---

### Task 4: Build the marker picker submenu with 10 icons

**Files:**
- Modify: `frontend/src/components/Editor/TencentMindEditor.jsx`

- [ ] **Step 1: Create marker picker component**

Inside the `handleRemoveGeneralization` area (or near the bottom, before export), add:

```jsx
const MARKER_ICONS = [
  { key: 'tencent_question', label: '疑问', svg: questionIcon },
  { key: 'tencent_priority', label: '优先级', svg: priorityIcon },
  { key: 'tencent_progress', label: '进度', svg: progressIcon },
  { key: 'tencent_star', label: '星标', svg: starIcon },
  { key: 'tencent_check', label: '完成', svg: checkIcon },
  { key: 'tencent_cross', label: '错误', svg: crossIcon },
  { key: 'tencent_idea', label: '灵感', svg: ideaIcon },
  { key: 'tencent_warning', label: '警告', svg: warningIcon },
  { key: 'tencent_target', label: '目标', svg: targetIcon },
  { key: 'tencent_clock', label: '时钟', svg: clockIcon },
]

const MarkerPicker = forwardRef(function MarkerPicker({ node, onClose }, ref) {
  const currentIcons = node?.getData?.('icon') || node?.data?.icon || []

  const handleToggle = useCallback((key) => {
    const mm = mmRef.current
    if (!mm) return
    const activeNode = node
    if (!activeNode) return
    const icons = activeNode.getData?.('icon') || []
    if (icons.includes(key)) {
      activeNode.setIcon(icons.filter(k => k !== key))
    } else {
      activeNode.setIcon([...icons, key])
    }
    mm.emit('data_change')
    onClose?.()
  }, [node, onClose])

  return (
    <div ref={ref} className="grid grid-cols-5 gap-1 w-[140px]">
      {MARKER_ICONS.map(({ key, label, svg }) => {
        const active = currentIcons.includes(key)
        return (
          <button
            key={key}
            title={label}
            className={`w-7 h-7 flex items-center justify-center rounded ${
              active ? 'bg-blue-100 ring-2 ring-blue-400' : 'hover:bg-gray-100'
            }`}
            onClick={() => handleToggle(key)}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )
      })}
    </div>
  )
})
```

Wait — `mmRef` is in the component closure, but `MarkerPicker` is defined outside the component. `mmRef` won't be in scope. Need a different approach.

**Better approach:** Define `MarkerPicker` inside the component (after the handler definitions), or pass `mmRef` as a prop.

Simpler: inline the marker picker JSX directly in the context menu JSX, avoiding a separate component:

Replace the empty marker picker div in Task 3 with:

```jsx
            <div
              ref={markerMenuRef}
              className="hidden absolute left-full top-0 ml-1 bg-white rounded-lg shadow-xl border border-gray-200 p-2"
              onMouseEnter={() => markerMenuRef.current?.classList.remove('hidden')}
              onMouseLeave={() => markerMenuRef.current?.classList.add('hidden')}
            >
              <div className="grid grid-cols-5 gap-1 w-[140px]">
                {[
                  { key: 'tencent_question', label: '疑问', svg: questionIcon },
                  { key: 'tencent_priority', label: '优先级', svg: priorityIcon },
                  { key: 'tencent_progress', label: '进度', svg: progressIcon },
                  { key: 'tencent_star', label: '星标', svg: starIcon },
                  { key: 'tencent_check', label: '完成', svg: checkIcon },
                  { key: 'tencent_cross', label: '错误', svg: crossIcon },
                  { key: 'tencent_idea', label: '灵感', svg: ideaIcon },
                  { key: 'tencent_warning', label: '警告', svg: warningIcon },
                  { key: 'tencent_target', label: '目标', svg: targetIcon },
                  { key: 'tencent_clock', label: '时钟', svg: clockIcon },
                ].map(({ key, label, svg }) => {
                  const node = contextNodeRef.current
                  const active = node ? (node.getData?.('icon') || node.data?.icon || []).includes(key) : false
                  return (
                    <button
                      key={key}
                      title={label}
                      className={`w-7 h-7 flex items-center justify-center rounded ${
                        active ? 'bg-blue-100 ring-2 ring-blue-400' : 'hover:bg-gray-100'
                      }`}
                      onClick={() => {
                        const mm = mmRef.current
                        const node = contextNodeRef.current
                        if (!mm || !node) return
                        const icons = node.getData?.('icon') || []
                        if (icons.includes(key)) {
                          node.setIcon(icons.filter(k => k !== key))
                        } else {
                          node.setIcon([...icons, key])
                        }
                        mm.emit('data_change')
                        setContextMenu(null)
                      }}
                      dangerouslySetInnerHTML={{ __html: svg }}
                    />
                  )
                })}
              </div>
            </div>
```

But this needs access to `questionIcon`, `priorityIcon` etc. These are defined in `marker-icons.js`. We need to import them.

- [ ] **Step 2: Update imports to bring in SVG icon strings**

In the import section, change:
```js
import { TENCENT_MARKER_ICONS } from '../../lib/marker-icons'
```
to:
```js
import { TENCENT_MARKER_ICONS, questionIcon, priorityIcon, progressIcon, starIcon, checkIcon, crossIcon, ideaIcon, warningIcon, targetIcon, clockIcon } from '../../lib/marker-icons'
```

Then update `marker-icons.js` to export each SVG constant individually:

Add `export` before each const declaration:
```js
export const questionIcon = ...
export const priorityIcon = ...
...
```

- [ ] **Step 3: Verify no circular deps or import errors**

Check dev server console for import errors. Expected: clean compile.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/marker-icons.js frontend/src/components/Editor/TencentMindEditor.jsx
git commit -m "feat: add marker picker submenu with 10 icons in context menu"
```

---

### Task 5: Simplify toolbar — remove node operations, keep global controls

**Files:**
- Modify: `frontend/src/components/Editor/TencentMindEditor.jsx`

- [ ] **Step 1: Remove toolbar buttons**

In the toolbar JSX (inside the `return` block), delete everything between `<span className="text-xs text-gray-400 font-mono mr-2">腾讯思维</span>` and the layout/theme dropdown section. Keep only:

```jsx
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b shrink-0 flex-wrap">
        <span className="text-xs text-gray-400 font-mono mr-2">腾讯思维</span>

        <select ...>...</select>  {/* layout */}
        <select ...>...</select>  {/* theme */}

        <div className="w-px h-4 bg-gray-300 mx-1" />

        <label ...>...</label>  {/* readonly checkbox */}

        <div className="flex-1" />

        <button ...>保存</button>
      </div>
```

Things to remove:
- `添加子节点` button
- `添加同级` button
- `添加媒体` button
- `关联线` / `取消关联线` button
- `删除关联线` button
- the first `div.w-px` separator
- `添加概要` button
- `删除概要` button
- `添加外框` button
- `删除外框` button
- `标记` button
- the second `div.w-px` separator

Keep:
- `腾讯思维` label
- layout `<select>`
- theme `<select>`
- the divider before readonly
- readonly `<label>`
- flex spacer
- `保存` button

- [ ] **Step 2: Verify**

Open the editor in a browser. Expected:
- Toolbar shows only: 腾讯思维 label, layout, theme, readonly, save
- Right-click any node → context menu appears with all removed operations
- Each menu item executes the correct action
- Root node → "添加同级" and "添加概要"/"删除概要" are disabled
- Marker submenu opens on hover/click, toggles icons correctly

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Editor/TencentMindEditor.jsx
git commit -m "refactor: remove node operation buttons from toolbar, moved to context menu"
```
