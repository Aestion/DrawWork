# DrawWork — UX 改进方案

**日期:** 2026-05-12  
**现状:** 功能完整，但操作反馈/通知/视觉层次/交互细节薄弱

---

## 一、核心问题诊断

### 1.1 零操作反馈
| 操作 | 当前行为 | 用户感受 |
|------|----------|----------|
| 添加看板卡片 | 输入框消失，无确认 | 不知道加没加上 |
| 删除泳道/列 | confirm + 直接消失 | 误删无法恢复 |
| 创建投票 | 表单关闭，无提示 | 不确定成功与否 |
| 投票提交 | 报 400 无前端提示 | 困惑 |
| Yjs 同步 | 后台自动，无提示 | 不知道是否已保存 |

### 1.2 状态缺失
| 状态 | 当前 | 需要 |
|------|------|------|
| 连接状态 | 仅标题栏"synced"小字 | 编辑器内应有可见指示器 |
| 操作加载 | 无 | 按钮应有 loading 动画 |
| 网络断开 | 无提示 | Toast 通知用户 |
| 数据冲突 | 无声处理 | 冲突时应有提示 |

### 1.3 视觉粗糙
| 问题 | 表现 |
|------|------|
| 看板卡片计数 | `(0)` 混在标题中 |
| 泳道图箭头 | 固定坐标偏移，不对齐实际元素 |
| 编辑器间距不一致 | 看板/泳道/投票 各自不同的 padding/margin |
| 缺少暗色模式 | 同上 |

---

## 二、改进方案

按优先级分三个批次：

### 🔴 P0 — 必须修

#### UX-001 统一 Toast 通知系统

**目标:** 成功/失败/警告操作后有 Toast 提示

```jsx
// src/lib/toast.js
// 轻量级单例 Toast
const show = (message, type = 'success', duration = 2000) => {
  // 在 body 末尾动态挂载 toast div
  // type: success(绿) / error(红) / warning(黄) / info(蓝)
}

export const toast = { success, error, warning, info }
```

**接入点:**
- KanbanEditor: 添加卡片/删除列 → toast.success / toast.error
- SwimlaneEditor: 添加元素/删除泳道 → toast.success
- VotePanel: 创建投票/提交投票 → toast.success
- 网络断开/重连: toast.warning / toast.success

---

#### UX-002 按钮/操作加载态

**目标:** 异步操作期间按钮显示旋转/禁用

**当前问题:** KanbanEditor/SwimlaneEditor 的"添加"按钮没有 loading 状态

**方案:** 
- 所有提交类按钮添加 `loading` prop
- E.g. `<Button loading={submitting} disabled={submitting}>添加</Button>`
- 可统一封装 `<LoadingButton>` 组件

---

#### UX-003 Yjs 同步状态指示器

**目标:** 编辑器内可见的同步状态

**方案:**
```
[⚡ synced]   → 绿色  数据已同步
[⟳ syncing]  → 蓝色  正在同步
[✕ offline]  → 红色  离线
```

放在每个编辑器左上角，替换当前的标题栏小字

---

### 🟡 P1 — 建议修

#### UX-004 删除操作可撤销

**目标:** 列/卡片/泳道删除后显示"已删除 × 撤销" Toast

**方案:**
```
删除函数改为延时执行：
1. 从状态中移除
2. 显示 toast "已删除" + "撤销" 按钮
3. 3秒内点撤销 → 恢复
4. 3秒后 → 真正生效
```

---

#### UX-005 泳道图箭头对齐

**目标:** 箭头端点根据实际元素位置计算，而非固定偏移

**当前:** `x+50, y+20` 硬编码
**修改:** 从 `elements` 的 `x/y` + 元素尺寸实时计算箭头端点

---

#### UX-006 骨架屏加载

**目标:** 编辑器加载时不显示"加载中..."文字，改为骨架屏

**方案:**
```jsx
// 看板骨架屏：3 个灰色矩形列
// 泳道骨架屏：2 个灰色水平条
// 投票骨架屏：3 个灰色选项卡片
```

---

### 🟢 P2 — 锦上添花

| # | 改进 | 说明 |
|---|------|------|
| UX-007 | 卡片编辑双击激活 | 当前看板卡片点单击打开编辑弹窗，改为双击 |
| UX-008 | 拖拽释放高亮 | 拖拽卡片到列时，目标列边框高亮 |
| UX-009 | 投票进度条动画 | 投票结果柱状图从 0→width 过渡动画 |
| UX-010 | 键盘快捷键提示 | 看板/泳道底部显示快捷键提示行 |
| UX-011 | 空状态引导 | 看板无列时显示"添加第一列"引导，泳道同理 |
| UX-012 | 响应式布局 | 看板列宽度当前固定 256px，移动端应自适应 |

---

## 三、实施计划

### Phase 1 (约 2h)
```
UX-001 Toast 通知系统     → 新建 src/hooks/useToast.js + Toast 组件
UX-002 按钮加载态         → 封装 LoadingButton 组件，替换现有按钮
UX-003 同步状态指示器     → 新建 SyncIndicator 组件，接入各编辑器
```

### Phase 2 (约 2h)
```
UX-004 删除可撤销         → 修改 KanbanEditor/SwimlaneEditor 删除逻辑
UX-005 泳道箭头对齐       → 重写 renderArrow 计算逻辑
UX-006 骨架屏             → 为 3 个编辑器添加 Skeleton 组件
```

### Phase 3 (约 1h)
```
UX-007~UX-012             → 双击编辑/拖拽高亮/动画/快捷键/空状态/响应式
```

---

## 四、组件结构建议

```
frontend/src/components/
├── ui/                    # 新建 — 通用 UI 组件
│   ├── Toast.jsx          # Toast 通知
│   ├── LoadingButton.jsx  # 带 loading 的按钮
│   ├── SyncIndicator.jsx  # 同步状态指示灯
│   └── Skeleton.jsx       # 骨架屏
├── Editor/
│   ├── KanbanEditor.jsx
│   ├── SwimlaneEditor.jsx
│   └── VotePanel.jsx
```

---

## 五、注意事项

1. **Toast 定位:** 右上角 fixed，z-index 最高（>1000）
2. **同步指示器:** 复用现有的 `connected/synced/onlineCount` 属性
3. **LoadingButton:** 不引入第三方库，用纯 CSS 旋转动画
4. **删除撤销:** 保留 element 在状态中 + 定时器，不直接从数组 splice
