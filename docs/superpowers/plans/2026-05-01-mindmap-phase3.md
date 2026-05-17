# 思维导图 Phase 3: 跨树连接实现计划

## 目标
实现跨树（不同根节点之间）的虚线连接功能。

## 设计要点

### 数据模型
```typescript
interface CrossConnection {
  fromNodeId: string
  toNodeId: string
  label?: string
}

interface MindMapData {
  roots: MindNode[]
  crossConnections: CrossConnection[]  // 新增
  layout: 'vertical' | 'horizontal' | 'radial'
}
```

### 功能列表
- [x] Shift+点击创建跨树连接
- [x] 虚线边渲染
- [x] 选择边后显示删除按钮
- [x] 保存/加载 crossConnections

## 任务清单

### 1. 边类型定义
- [x] 创建 CrossConnectionEdge 组件
- [x] 虚线样式 (strokeDasharray: '5,5')
- [x] 标签渲染支持
- [x] 删除按钮（选中时显示）

### 2. 交互逻辑
- [x] Shift+点击节点触发连接创建
- [x] 检查是否已存在连接
- [x] 防止同树内节点创建跨树连接
- [x] 点击删除按钮移除连接

### 3. 数据持久化
- [x] treesToFlowData 加载 crossConnections
- [x] flowDataToTrees 保存 crossConnections
- [x] API 调用包含 crossConnections

### 4. UI提示
- [x] 快捷键面板添加跨树连接说明

## 验收标准
- [x] 可以创建跨树的虚线连接
- [x] 连接显示为虚线样式
- [x] 选中边后显示删除按钮
- [x] 数据正确保存和加载

## 实现详情

### 文件变更
- `frontend/src/components/Editor/MindMapEditor.jsx`
  - 添加 `CrossConnectionEdge` 组件
  - 添加 `edgeTypes` 定义
  - 实现 `handleNodeClick` 处理 Shift+点击
  - 实现 `handleDeleteCrossConnection` 删除连接
  - 更新 `treesToFlowData` 加载跨树连接
  - 更新 `flowDataToTrees` 保存跨树连接
  - 快捷键面板添加跨树连接说明
