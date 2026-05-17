# Archive — 废弃测试文件

以下文件已被 DrawWork 真实用户模拟测试框架取代，保留在此仅供历史参考。

## 来源：根目录

| 文件 | 原因 |
|------|------|
| `real_user_automation.py` | pyautogui 线性脚本 — 硬编码坐标，仅登录+画矩形 |
| `interactive_automation.py` | pyautogui 交互脚本 — 有骨架无画布测试，被 `level2-pyautogui/` 取代 |
| `test-drawwork-e2e.py` | Playwright 早期版本 — 被 `level1-playwright/specs/` 覆盖 |
| `test-drawwork-final.py` | Playwright 最终版 — 同上 |
| `test-drawwork-full.py` | Playwright 完整版 — 同上 |

## 来源：test-results/devtools/

| 文件 | 原因 |
|------|------|
| `comprehensive-test-suite.py` | Playwright + API 混合 — 被新框架分层架构取代 |
| `journey2-collaboration-test.py` | 协作专项 — 被 `mixed/test_collaboration.py` 取代 |
| `journey3-share-permissions-test.py` | 权限专项 — 被 `mixed/test_share_permissions.py` 取代 |
| `tc001_homepage_test.py` | Phase 1 首页测试 — 被 Level 1 取代 |
| `tc004_login_test.py` | Phase 1 登录测试 — 被 Level 1 取代 |
| `tc_full_flow_test.py` | Phase 1 全流程 v1 — 被新框架取代 |
| `tc_full_flow_test2.py` | Phase 1 全流程 v2 — 被新框架取代 |

## 来源：docs/

| 文件 | 原因 |
|------|------|
| `chrome-devtools-mcp-test-suite.md` | 手动测试计划 (44 case) — 测试点已整合到新框架各层 |
| `mindmap-test-plan-reference.md` | MindMap 专项测试点 (60+ 项) — 作为 `level2-pyautogui/mindmap/` 测试用例的参考材料 |

---

*最后更新: 2026-05-13*
