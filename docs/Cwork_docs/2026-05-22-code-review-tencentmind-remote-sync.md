# Code Review: TencentMindEditor 近两次提交

## Context

审查最近两次提交的协同编辑核心逻辑，覆盖 TencentMindEditor（原地更新、广播、宽限期）、useTencentMindYjs（observeDeep + HTTP 轮询）、以及 Playwright 测试。

---

## 发现的问题

### High — `hasPendingLocalSaveRef` 卡死

**文件:** `frontend/src/components/Editor/TencentMindEditor.jsx`

`hasPendingLocalSaveRef` 在 `data_change` handler 中置 `true`，但只在 `saveData` 成功时清除。以下场景会导致永久卡死：

1. **API 保存失败** — `catch` 块未重置该 ref
2. **mmRef.current 为 null** — `saveData` 提前 return，未重置
3. **快照去重短路** — `saveData` 比较发现无变化直接 return，未重置

**后果:** 远程更新 effect 在 line 733 看到 `hasPendingLocalSaveRef=true` 且 snapshot 不匹配时直接 return，**永久丢弃所有后续远程更新**。

**修复建议:** 在 `saveData` 的所有退出路径（成功、失败、短路）都重置 `hasPendingLocalSaveRef = false`。

---

### Medium — 2 秒窗口期编辑丢失

**文件:** `frontend/src/components/Editor/TencentMindEditor.jsx`

- `LOCAL_INTERACTION_GRACE_MS = 3000`
- `REMOTE_DATA_CHANGE_SUPPRESS_MS = 5000`

远程更新后 3~5 秒之间的用户编辑会因 `ignoreDataChangeUntilRef` 窗口 + 无 `localInteractionUntilRef` 保护而被静默丢弃。

**修复建议:** 将 `LOCAL_INTERACTION_GRACE_MS` 设为 >= `REMOTE_DATA_CHANGE_SUPPRESS_MS`，或在 `data_change` handler 中检测到内容真正变化时无条件放行。

---

### Medium — 广播与远程合并竞态

**文件:** `frontend/src/components/Editor/TencentMindEditor.jsx`

本地编辑 → `broadcastCurrentData` → `syncToYjs` → Yjs echo 回来 → 远程更新 effect。如果期间另一客户端也编辑了，合并后的远程 snapshot 与 `lastBroadcastSnapshotRef` 不同，导致远程更新被跳过，本地 save 随后覆盖掉对方的编辑。

**风险:** 并发编辑时可能丢失对方的修改（无 CRDT 合并）。

**修复建议:** 远程更新 effect 中当 `hasPendingLocalSaveRef=true` 时，不应直接 return，而是应将远程变更合并到本地数据后再 save。

---

### Low — `debounceRef` 死代码

**文件:** `frontend/src/hooks/useTencentMindYjs.js:19`

`debounceRef` 已声明但从未使用，重构后遗留。

**修复:** 删除。

---

### Low — `docObserver` 未防抖

**文件:** `frontend/src/hooks/useTencentMindYjs.js:80-83`

大量远程更新涌入时，`applyObservedData` 会频繁调用 `yMap.toJSON()` + `JSON.stringify()`，对大思维导图有性能影响。

**修复建议:** 可选地加 debounce（如 100ms），但非必须。

---

### Low — Playwright `waitForTimeout(4500)` 脆弱

**文件:** `test/level1-playwright/specs/tencentmind/tencentmind-collaboration.spec.js`

固定 4.5s sleep 在 CI 冷启动或网络抖动时可能不够，两个 sleep 串行执行浪费 9 秒。

**修复建议:** 改用 `expect.poll` 轮询条件等待，或并行执行。

---

### Low — `hasMindText` 可能误判

**文件:** `test/level1-playwright/specs/tencentmind/tencentmind-collaboration.spec.js:98`

`document.body.innerText.includes()` 会匹配页面上所有文本，不限于思维导图节点。测试用时间戳命名降低了误判概率，但逻辑上不够严谨。

**修复建议:** 优先走 render tree 检查，仅在 render tree 不可用时 fallback 到 DOM。

---

### Low — `KeyboardEvent` 属性不完整

**文件:** `test/level1-playwright/specs/tencentmind/tencentmind-collaboration.spec.js:149`

`renameRootChildFromPage` 只设了 `key: 'a'`，没设 `code`/`keyCode`。当前 `markLocalInteraction` 只检查事件存在性所以能工作，但如果将来 listener 变严格会静默失败。

---

## 不需要修复的发现

| 发现 | 原因 |
|------|------|
| `applyRemoteDataInPlace` 只在同结构时生效 | 设计如此，结构性变更（增删节点）回退到 full rebuild 是正确的 |
| `comparableTencentMindSnapshot` 只去掉了 relationship id | 其他字段（controlPoints 等）的漂移不太可能发生 |
| HTTP poll 和 Yjs observer 双重触发 | 已通过 `lastObservedSnapshotRef` 去重，不会重复应用 |
| `ignoreDataChangeUntilRef` 在 in-place 路径也被设置 | 安全冗余，无害 |
| 事件监听器清理 | 已正确处理 |

---

## 建议修复优先级

1. **必须修复:** `hasPendingLocalSaveRef` 卡死问题（High）
2. **建议修复:** 2s 窗口期编辑丢失（Medium）
3. **考虑修复:** 广播竞态（Medium，需要更多设计）
4. **可选:** 死代码清理、Playwright 改进、KeyboardEvent 完善
