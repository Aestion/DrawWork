# 2026-05-22 实时协同与删除闪回修复记录

## 背景

本次排查来自分享协同场景：

- 腾讯思维画布中，A 修改内容后，B 端不能实时看到；切换画布再回来也不能刷新，只有整页刷新后才能拿到新数据。
- Excalidraw 画布中，删除普通元素时元素会先消失、短暂重新出现约 1 秒、再彻底消失。

## 根因摘要

### 腾讯思维实时同步

1. `TencentMindEditor` 初始化时使用 4 秒时间窗口跳过 `data_change`，真实用户在打开画布后快速编辑时也会被吞掉。
2. 初始化/远端回放期间触发的恢复逻辑会产生无意义保存，并通过 Yjs 把旧快照广播出去，可能覆盖 A 端尚在 debounce 中的编辑。
3. `useTencentMindYjs` 使用 `transaction.local` 过滤 observer 事件过宽，provider 应用到本地 Y.Doc 的远端更新也可能被误判跳过。
4. 腾讯思维格式转换中，富文本元数据和 marker id 不稳定会导致快照误判：编辑文本可能被旧 richText 覆盖，未变化 marker 也会生成新 id。

### Excalidraw 删除闪回

Excalidraw 的远端激光笔/freedraw 淡出逻辑原本对所有 `isDeleted` 元素生效，普通矩形、椭圆等元素删除后也会被临时改回 `isDeleted: false` 渲染，从而出现“删除后又闪回”的视觉问题。

## 修复点

- `frontend/src/components/Editor/TencentMindEditor.jsx`
  - 移除初始化 4 秒跳过窗口。
  - 初始化恢复与远端应用期间只用 `applyingRemoteUpdateRef` 精准屏蔽回放事件。
  - 初始化/远端快照应用后刷新 `lastAppliedRemoteSnapshotRef` 与 `lastSavedSnapshotRef`，避免旧快照 echo-save。

- `frontend/src/hooks/useTencentMindYjs.js`
  - observer 只忽略本端 `origin === 'local-tencentmind-change'` 的写入，不再用过宽的 `transaction.local`。

- `frontend/src/lib/tencent-mind-utils.js`
  - 保存时优先使用当前编辑文本；只有当前文本与原 richText 文本一致时才复用富文本片段。
  - marker 图标未变化时保留原 marker 元数据，避免每次保存生成新 id。

- `frontend/src/components/Editor/ExcalidrawWrapper.jsx`
  - 新增 `shouldFadeDeletedElement`，仅允许已删除的 `freedraw` 元素进入短暂淡出保留逻辑。
  - 普通元素删除后不再临时恢复显示。

## 测试与验收

已补充/调整测试：

- `frontend/src/lib/tencent-mind-utils.test.js`
  - 覆盖“编辑文本不能被旧 richText 元数据覆盖”。
  - 覆盖“marker 图标未变化时保留原 marker 元数据”。

- `frontend/src/components/Editor/ExcalidrawWrapper.test.js`
  - 覆盖 `shouldFadeDeletedElement`：只对 deleted freedraw 返回 true。

- `test/level1-playwright/specs/tencentmind/tencentmind-collaboration.spec.js`
  - 将新增节点测试改为显式选择 root 并定位新增 child，避免受 SVG 点击 active node 状态影响。
  - 验证 A 新增节点后 B 无刷新实时可见。
  - 验证 A 编辑后 B 刷新可见持久化数据。

本次已通过命令：

```bash
cd frontend
npm test -- src/hooks/useTencentMindYjs.test.js src/lib/tencent-mind-utils.test.js src/components/Editor/ExcalidrawWrapper.test.js src/pages/EditorPage.test.jsx
npm run build

cd test/level1-playwright
npx playwright test tencentmind/tencentmind-collaboration.spec.js --config playwright.config.js --grep "real-time sync"
npx playwright test tencentmind/tencentmind-collaboration.spec.js --config playwright.config.js --grep "data persists"
npx playwright test collaboration.spec.js --config playwright.config.js --grep "delete single element"
```

验收结果：

- 前端相关单测：4 个测试文件 / 52 个测试通过。
- 腾讯思维实时协同 focused e2e：通过。
- 腾讯思维刷新持久化 focused e2e：通过。
- Excalidraw 删除单元素协同 e2e：通过。
- 前端生产构建：通过。构建仍保留既有 Excalidraw chunk 体积 warning。
