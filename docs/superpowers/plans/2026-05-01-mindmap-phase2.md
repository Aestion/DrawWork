# 思维导图 Phase 2: 媒体支持实现计划

## 目标
为思维导图节点添加图片/GIF/视频插入功能。

## 设计要点

### 数据模型
```typescript
interface MindNode {
  id: string
  text: string
  children?: MindNode[]
  media?: MediaItem[]  // 新增
}

interface MediaItem {
  type: 'image' | 'gif' | 'video'
  uploadId: string
  fileName: string
}
```

### 功能列表
- [x] 单节点最多 5 个媒体
- [x] 点击节点工具栏的 "+" 按钮添加媒体
- [x] 媒体显示在节点下方，可折叠
- [x] 复用现有画板的 `/upload` API

## 任务清单

### 1. 数据结构更新
- [x] 更新 treesToFlowData 传递 media 数据
- [x] 更新 flowDataToTrees 保存 media 数据
- [x] 更新 save/load API 处理 media

### 2. MindNode 组件增强
- [x] 添加媒体显示区域
- [x] 媒体折叠/展开功能
- [x] 删除媒体按钮

### 3. 媒体上传
- [x] 文件选择对话框
- [x] 上传到服务器获取 uploadId
- [x] 添加到节点 media 数组

### 4. Markdown 处理
- [x] 导出时媒体转为 `[图片:文件名]` 占位符
- [x] 导入时占位符静默忽略

## 验收标准
- [x] 可以向节点插入图片/GIF/视频
- [x] 媒体正确显示在节点下方
- [x] 单节点媒体不超过 5 个
- [x] Markdown 导出包含媒体占位符

## 实现详情

### 文件变更
- `frontend/src/components/Editor/MindMapEditor.jsx`
  - 添加 `MediaItemView` 组件：显示图片/视频，支持删除按钮
  - 更新 `MindNode` 组件：添加媒体显示区域，折叠/展开按钮
  - 更新 `treesToFlowData`：传递 media 数据到节点
  - 更新 `flowDataToTrees`：保存 media 数据到树结构
  - 添加 `handleAddMedia`：文件上传处理
  - 添加 `handleDeleteMedia`：删除指定媒体
  - 所有新节点默认包含空 media 数组
