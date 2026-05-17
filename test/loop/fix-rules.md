# AI Fix Rules — DrawWork 测试修复指南

当 `test/loop/runner.py` 检测到测试失败，会写入 `test/results/fix-request.md`。
读取该文件后，按以下规则判断和修复。

---

## 规则 1: 服务未就绪

**症状:** `Connection refused`, `502 Bad Gateway`, `socket.timeout`

**判定:** 环境问题，非代码 bug

**动作:**
1. 检查 `backend/src/app.js` 是否正常启动
2. 检查端口是否被占用 (`netstat -ano | findstr :3000`)
3. 重启服务或等待重试

**不要修改源码。** 标记为环境问题。

---

## 规则 2: Playwright 元素未找到

**症状:** `Timeout waiting for selector`, `element not found`, `text=xxx` 未匹配

**判定:** 可能是前端 UI 变了（选择器改了 / 文案改了），或者页面没渲染完

**动作:**
1. 看 `test/results/screenshots/` 下的截图——页面实际渲染了什么？
2. 打开 `test/results/reports/html/` 的 Playwright HTML 报告
3. 如果 DOM 结构变了 → 更新 Playwright spec 中的 selector
4. 如果页面没加载完 → 增加 timeout 或 waitFor 条件
5. 如果是前端 bug（组件没渲染）→ 修复前端代码

---

## 规则 3: pyautogui 坐标偏移

**症状:** `l2_*_before` vs `l2_*_after` 对比无差异（点击到了错误位置）

**判定:** UI 布局变了 or 窗口没正常定位

**动作:**
1. 看截图：画的是什么区域？点到了哪里？
2. 如果 UI 布局变了 → 更新 `shared/coord-manager.py` 中的 `LAYOUT` 比例
3. 如果窗口没被正确检测 → 检查窗口标题，更新 `TITLE_PATTERNS`
4. 使用截图人工判断是否是新 UI 还是测试脚本过时

---

## 规则 4: 视觉回归 (像素差异超阈值)

**症状:** `FAIL (X% > 5%)` 但截图看起来没问题

**判定:** 可能是预期内的 UI 变更（颜色微调、间距改动），也可能是渲染 bug

**动作:**
1. 打开 `test/results/diffs/diff_*.png` 查看差异图
2. 红色 = 差异像素，如果大面积红色 → 可能是渲染 bug
3. 如果是预期 UI 变更 → 更新基线：在 `test/shared/screenshot-diff.py` 中执行 `ScreenshotDiff.update_baseline()`
4. 如果是渲染 bug → 修复前端代码

---

## 规则 5: API 返回错误

**症状:** `Expected 200, got 401/403/500`

**判定:** 后端逻辑问题

**动作:**
1. 读 `test/api/` 中对应测试文件的请求参数
2. 检查对应 `backend/src/routes/*.js` 的路由逻辑
3. 修复后端代码 → 执行 `pytest test/api/test_xxx.py -v` 验证
4. 如果涉及数据库 schema → 可能需要手动 migrate

---

## 规则 6: 所有测试连续失败 ≥ 5 次

**判定:** 放弃自动修复，标记为 manual triage

**动作:**
1. 不再尝试自动修复
2. 汇总所有失败截图和日志
3. 通知人工介入

---

## 触发重跑

修复后，**删除 `test/results/fix-request.md`**。`loop/runner.py` 检测到文件消失后自动重跑。

---

*最后更新: 2026-05-13*
