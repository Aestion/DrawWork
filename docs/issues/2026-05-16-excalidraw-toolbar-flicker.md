# Excalidraw 工具栏图标闪烁问题

## 问题描述

创建 2 个及以上画布后，从画布 A 切换到画布 B，再切换回画布 A，画布 A 当前选中的工具图标持续闪烁（选中→取消→选中→取消循环）。鼠标移动、点击等任何交互都会加剧闪烁。

## 环境

- Excalidraw 0.17.6
- React 18 (Vite)
- 多画布通过 `display:none`/`display:''` 实现 keep-alive

## 根因分析

### 核心原因：`renderTopRightUI` 内联函数破坏 Excalidraw 的 React.memo

Excalidraw 的默认导出组件使用 `React.memo(ExcalidrawBase, areEqual)` 包裹，第二个参数 `areEqual` 用 `isShallowEqual` 比较新旧 props。

项目中 `<Excalidraw>` 的 `renderTopRightUI` prop 写成内联箭头函数：

```jsx
<Excalidraw
  renderTopRightUI={() => (canEdit ? <button>插入媒体</button> : null)}
/>
```

每次 ExcalidrawWrapper 重渲染都创建新的函数引用。`areEqual` 检测到 `renderTopRightUI` 引用变化，返回 `false`，导致 Excalidraw 无条件重渲染。

### 触发链路（永久循环）

```
用户交互 / 任何 onChange
  → handleChange
    → queueOverlayStateUpdate
      → setOverlayState(newObj)  ← 每次新对象，React 不 bail out
        → ExcalidrawWrapper 重渲染
          → 新 renderTopRightUI 引用
            → areEqual() 返回 false
              → <Excalidraw> (React.memo) 重渲染
                → componentDidUpdate
                  → onChange
                    → handleChange
                      → queueOverlayStateUpdate  ← 回到起点
```

该循环以 requestAnimationFrame 频率（~60fps）持续运行。虽然 Excalidraw 内部状态未变化，但高频重渲染导致：
1. DOM 频繁重新计算
2. toolbar DOM 被 React reconciliation 反复对比/修补
3. CSS transition/animation 重复触发
4. 用户感知为"闪烁"

### 附加因素：协作光标轮询

`ExcalidrawWrapper` 的协作光标轮询（`useEffect` 内每 50ms 调用 `api.updateScene({ appState: { collaborators } })`）在单用户场景下仍持续触发 Excalidraw 的 `componentDidUpdate` → `onChange`，是循环的重要驱动力之一。

### 为什么只在画布切换后出现

`display:none` 隐藏后恢复时，Excalidraw 的 ResizeObserver 触发 `updateDOMRect()` → `setState({ width, height })`，再叠加上述循环，导致 toolbar DOM 出现可感知的闪烁。

## 修复

### 修复 1：缓存 `renderTopRightUI`（根本修复）

[ExcalidrawWrapper.jsx](../../frontend/src/components/Editor/ExcalidrawWrapper.jsx)

将内联函数提取为 `useCallback`，保持引用稳定：

```jsx
const renderTopRightUI = useCallback(() => {
  if (!canEdit) return null
  return (
    <>
      <button className="sidebar-trigger default-sidebar-trigger" ...>
        ...
      </button>
      <input ref={fileInputRef} type="file" ... />
    </>
  )
}, [canEdit, handleFileInputChange])
```

然后在 JSX 中使用引用而非内联：

```jsx
<Excalidraw renderTopRightUI={renderTopRightUI} ... />
```

### 修复 2：协作光标去重（辅助修复）

[ExcalidrawWrapper.jsx](../../frontend/src/components/Editor/ExcalidrawWrapper.jsx#L347)

在协作光标轮询中添加序列化比对，只有 collaborators 数据真实变化时才调用 `api.updateScene()`，减少不必要的 Excalidraw 重渲染：

```jsx
const serialized = JSON.stringify([...nextCollaborators.entries()])
if (serialized === lastSerialized) return
lastSerialized = serialized
```

## 关键代码位置

| 文件 | 行号 | 说明 |
|------|------|------|
| `ExcalidrawWrapper.jsx` | ~1235 (旧) / useCallback (新) | `renderTopRightUI` 内联函数是根因 |
| `ExcalidrawWrapper.jsx:767` | `handleChange` | 每次 onChange 调用 `queueOverlayStateUpdate` |
| `ExcalidrawWrapper.jsx:380` | `queueOverlayStateUpdate` | 通过 `setOverlayState` 触发重渲染 |
| `ExcalidrawWrapper.jsx:347` | 协作光标轮询 | 辅助驱动力 |
| `excalidraw.development.js` | App 类 `componentDidUpdate` | 每次重渲染都触发 `onChange` |
| `excalidraw.development.js` | `Excalidraw = memo(ExcalidrawBase, areEqual)` | React.memo + 自定义比较 |
| `excalidraw.development.js` | `areEqual` 函数 | `isShallowEqual` 比较所有非 appState props |

## 验证

- [x] 创建 2 个 Excalidraw 画布
- [x] 在画布 1 选择绘图工具（如矩形）
- [x] 切换到画布 2，再切回画布 1
- [x] 工具图标不再闪烁
- [x] 鼠标移动、点击不会触发闪烁
- [ ] 多用户协同时光标更新正常

## 经验教训

1. **Excalidraw 的 React.memo 是脆弱的** — `areEqual` 比较所有 props 的引用相等性，任何内联函数/对象都会破坏 memo 效果
2. **`setState` 对象引用的陷阱** — 即使内容相同，新对象引用也会阻止 React bail-out，形成循环
3. **`renderTopRightUI` 不应该是内联函数** — 始终用 `useCallback`/`useMemo` 包裹传给第三方库的 render props
4. **`handleChange` 中 `queueOverlayStateUpdate` 的副作用** — 它在 `remoteApplyRef` 守卫之前运行，且始终调用 `setOverlayState`，成为循环的关键一环
