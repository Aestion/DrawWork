# GIF/视频拖动残影问题

## 现象

拖动或缩放画布上的 GIF/视频元素时，其 DOM overlay 层会滞后于 Excalidraw canvas 的绘制，产生明显的"残影"/"拖尾"效果。

## 根因分析

Excalidraw 的绘制流程：

1. 用户拖动元素 → Excalidraw 在 `<canvas>` 上**立即**重绘新位置
2. 同时触发 `onChange` 回调 → 我们更新 React state → 进入 RAF 队列
3. RAF 执行 → `setOverlayState` → React 重新渲染 → DOM overlay 更新位置

步骤 1 是同步的（16ms 内完成），步骤 3 至少延迟一帧（16ms+）。在这 16~32ms 的窗口期内，canvas 已在新位置绘制，而 DOM overlay 还在旧位置，形成视觉重叠，即"残影"。

## 失败的尝试

### 尝试 1：从 overlayState 读取 selectedElementIds

```javascript
const selectedIds = overlayState.appState?.selectedElementIds || {}
const draggingId = overlayState.appState?.draggingElement?.id || null
```

**失败原因**：`overlayState` 来自 Yjs 同步数据，其中 `appState` 只包含持久化字段（`viewBackgroundColor`/`gridSize`/`theme`），**不含** `selectedElementIds`、`draggingElement` 等 transient UI state。因此判断永远为 false，隐藏逻辑未生效。

### 尝试 2：pointerdown 事件监听

在 `containerRef` 上监听 `pointerdown`/`pointerup` 来设置 `isInteracting`。

**失败原因**：Excalidraw 内部 `<canvas>` 可能拦截/消费了 pointer 事件，事件未冒泡到容器层，`pointerdown` 未被触发。

### 尝试 3：opacity-0 淡出

用 `transition-opacity duration-75` 在交互期间将 overlay 透明度设为 0。

**失败原因**：`opacity: 0` 只是让元素不可见，但 DOM 节点仍在合成层（compositor layer），浏览器在快速移动 canvas 像素时仍可能将其纳入合成，残影依旧。

## 最终修复

**文件**：`frontend/src/components/Editor/ExcalidrawWrapper.jsx`

### 1. 从 handleChange 读取实时交互状态

```javascript
const handleChange = useCallback((elements, appState, files) => {
  queueOverlayStateUpdate(elements, appState)

  // 直接读取 onChange 回调中的 appState，这是每帧实时数据
  const isDragging = !!appState?.draggingElement
  const isEditing = !!appState?.editingElement
  const isResizing = !!appState?.resizingElement
  if (isDragging || isEditing || isResizing) {
    if (interactionDebounceRef.current) {
      clearTimeout(interactionDebounceRef.current)
      interactionDebounceRef.current = null
    }
    if (!isInteracting) setIsInteracting(true)
  } else {
    if (isInteracting && !interactionDebounceRef.current) {
      // 停止交互后 80ms 再恢复，避免末尾闪烁
      interactionDebounceRef.current = setTimeout(() => {
        setIsInteracting(false)
        interactionDebounceRef.current = null
      }, 80)
    }
  }
  // ...sync logic
}, [queueOverlayStateUpdate, setData, isInteracting])
```

### 2. 用 hidden 完全卸载 overlay

```jsx
<div className={`pointer-events-none absolute inset-0 z-[2] overflow-hidden ${isInteracting ? 'hidden' : ''}`}>
```

`hidden`（`display: none`）将元素从渲染树完全移除，而不是仅降低透明度。这确保拖动期间浏览器合成器不会将 overlay 纳入任何合成操作，彻底消除残影。

## 验证

- 选中 GIF/视频元素并拖动，无残影
- 选中并缩放（resize），无残影
- 停止拖动后，GIF/视频动画正常恢复
