# 思维导图 E2E 测试说明

## 测试文件
- `mindmap.spec.js` - 思维导图功能 E2E 测试

## 测试覆盖

### Mindmap Editor 基础功能
1. **user can create and view a mindmap**
   - 创建思维导图画板
   - 验证编辑器 UI 元素（保存按钮、+中心按钮、导出/导入 Markdown）
   - 验证快捷键提示显示

2. **user can add child nodes with Tab key**
   - 选中根节点
   - 按 Tab 键创建子节点
   - 验证子节点显示

3. **user can add sibling nodes with Enter key**
   - 创建子节点
   - 按 Enter 键创建兄弟节点
   - 验证两个节点同时存在

4. **user can add multiple root nodes with Ctrl+Enter**
   - 按 Ctrl+Enter 创建新根节点
   - 验证多个根节点同时存在

5. **user can edit node text by double clicking**
   - 双击节点编辑文本
   - 输入新文本并按 Enter
   - 验证文本已更新

6. **user can save and load mindmap data**
   - 修改节点文本
   - 点击保存按钮
   - 重新打开画板验证数据持久化

### Mindmap Media Support 媒体功能
7. **user can see add media button on node**
   - 验证节点上显示 "+ 添加媒体" 按钮

8. **user can add media to a node**
   - 点击添加媒体按钮
   - 打开文件选择对话框（文件上传在 headless 模式下无法完整测试）

### Mindmap Markdown Export/Import
9. **user can export mindmap to markdown**
   - 添加子节点
   - 点击导出 Markdown 按钮
   - 验证下载的文件名为 `mindmap.md`

10. **user can import markdown to mindmap**
    - 点击导入 Markdown 按钮
    - 打开文件选择对话框

### Mindmap Cross-tree Connections 跨树连接
11. **user can create cross-tree connection with Shift+click**
    - 创建两个根节点
    - 选中第一个根节点
    - 按住 Shift 点击第二个根节点
    - 验证跨树连接创建成功

## 运行测试

### 前置条件
1. 启动 PostgreSQL 数据库
2. 启动 Redis
3. 启动后端服务：`cd backend && npm start`
4. 启动前端服务：`cd frontend && npm run dev`

### 运行命令
```bash
# 运行所有思维导图测试
cd e2e
npx playwright test tests/mindmap.spec.js

# 运行特定测试
cd e2e
npx playwright test tests/mindmap.spec.js --grep "user can create and view a mindmap"

# 生成报告
npx playwright show-report results/html-report
```

## 注意事项
- 文件上传测试在 headless 模式下受限，实际文件上传需要真实文件
- 跨树连接测试需要两个树节点位置可见，测试可能在不同屏幕尺寸下需要调整
