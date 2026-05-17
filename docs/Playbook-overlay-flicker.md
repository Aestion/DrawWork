---
name: GIF/Video Overlay Drag Flickering
description: 拖动 Excalidraw 画布时 GIF/视频闪烁的根因和解决方案
type: reference
---

## 问题现象

- 拖动 Excalidraw 画布上的 GIF 或视频时，overlay 层的富媒体每秒闪烁多次
- 影响所有富媒体（不仅是正在拖动的那一个）
- 控制台有大量 `[observe] source: local elements: N files: M` 日志

## 根本原因

数据流中存在时序竞态，导致 `overlayStateRef` 里每帧交替写入正确/错误的 scroll/zoom 值。

**正常流程：**
```
handleChange → queueOverlayStateUpdate(elements, fullAppState)
             → ref 存完整数据（含 scrollX/scrollY/zoom）✅
```

**Yjs observe 流程（setData 的 RAF 中触发）：**
```
handleChange → setData(nextScene) → Yjs observe (source:'local')
            → queueOverlayStateUpdate(elements, filteredAppState)
            → ref 被覆盖为不含 scroll/zoom 的数据 ❌
```

`handleChange` 里在调用 `setData` 之前会从 `appState` 中剥离 scrollX/scrollY/zoom（这些不应同步给协作者），存入 Yjs 的是过滤后的 appState。

当 `setData` 触发 Yjs observe 回调时，`queueOverlayStateUpdate` 被再次调用，用 Yjs 存储的过滤后 appState 覆盖了 `overlayStateRef.current`，导致 RAF 定位循环读到 scrollX=0、scrollY=0 算出错误位置。

由于 RAF 定位循环和 RAF-setData 交替触发，ref 里的 scroll/zoom 每帧在"正确值"和"默认值(0)"之间跳动，造成 overlay 视觉闪烁。

## 解决步骤

### 修改 ExcalidrawWrapper.jsx

#### 1. 移除 observe 回调中本地变更分支的 queueOverlayStateUpdate 调用

```js
// 修改前（有 bug）：
if (meta.source === 'local') {
    queueOverlayStateUpdate(nextScene.elements, nextScene.appState)
    return
}

// 修改后：
if (meta.source === 'local') {
    // handleChange 已经用完整 appState 调用过了，
    // Yjs 里的数据缺 scroll/zoom，不应覆盖 ref
    return
}
```

因为 `handleChange` 始终先于 observe 用完整数据调用 `queueOverlayStateUpdate`，observe 分支里的重复调用是多余且有害的。

#### 2. 拖动时跳过 React 状态更新

在 `queueOverlayStateUpdate` 中增加 `isInteractingRef` 检查：

```js
const queueOverlayStateUpdate = useCallback((elements, appState) => {
    overlayStateRef.current = { elements: elements || [], appState: appState || {} }

    // 拖动时跳过 React state，防止 reconciliation 闪烁
    if (isInteractingRef.current) return

    if (overlayFrameRef.current) {
      cancelAnimationFrame(overlayFrameRef.current)
    }
    overlayFrameRef.current = requestAnimationFrame(() => {
      setOverlayState({ elements: elements || [], appState: appState || {} })
    })
  }, [])
```

#### 3. 使用独立 RAF 循环直接操作 DOM

新增持续运行的 RAF 定位循环，绕过 React reconciliation 直接更新 DOM style：

```js
useEffect(() => {
    let rafId
    const updatePositions = () => {
      const { elements, appState } = overlayStateRef.current
      // ... 计算位置并设置 domEl.style.left/top/width/height/transform
      rafId = requestAnimationFrame(updatePositions)
    }
    rafId = requestAnimationFrame(updatePositions)
    return () => cancelAnimationFrame(rafId)
  }, [])
```

## 架构要点

| 组件 | 职责 | 更新方式 |
|------|------|----------|
| `overlayStateRef` | 最新的 overlay 状态（包含 scroll/zoom） | 即时写入 |
| RAF 定位循环 | 更新 DOM 位置 | 每帧直接从 ref 读取 |
| `MediaOverlayItem` | 挂载/卸载媒体 DOM 节点 | React + memo |
| `queueOverlayStateUpdate` | 写入 ref + 调度 React state | 即时写入 ref |
| `setOverlayState`（React） | 控制媒体生命周期（添加/移除元素） | RAF 调度 |

## 相关文件

- `frontend/src/components/Editor/ExcalidrawWrapper.jsx`
  - `MediaOverlayItem` — 注册 DOM 节点供 RAF 定位，不接收位置 prop
  - `queueOverlayStateUpdate` — 拖动时跳 React 重渲染
  - RAF 位置更新 `useEffect` — 连续定位循环
  - observe callback — 移除了本地分支的覆盖调用

## 预防措施

- 任何新的 Yjs 写入路径必须确保不从 observe 回调中调用 `queueOverlayStateUpdate`
- `handleChange` 应是本地数据更新的单入口
- 往 `overlayStateRef` 写入 appState 时，确保包含 scrollX/scrollY/zoom
