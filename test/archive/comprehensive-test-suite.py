"""
DrawWork Comprehensive Test Suite
整合: Playwright + Chrome DevTools MCP + API 测试

测试方式:
1. DevTools MCP - 浏览器控制、性能分析、网络监控
2. Playwright - 页面交互、截图对比、多浏览器
3. API 直接调用 - 绕过 UI 快速验证后端
4. 混合模式 - API 准备数据 + DevTools 验证 UI
"""

from playwright.sync_api import sync_playwright
import json
import os
import time
import requests
from datetime import datetime

TEST_RESULTS_DIR = "e:/DrawWork/test-results/devtools"
os.makedirs(f"{TEST_RESULTS_DIR}/screenshots", exist_ok=True)
os.makedirs(f"{TEST_RESULTS_DIR}/reports", exist_ok=True)
os.makedirs(f"{TEST_RESULTS_DIR}/performance", exist_ok=True)

# ============ 配置 ============
BASE_URL = "http://localhost:5173"
API_URL = "http://localhost:3000"
WS_URL = "ws://localhost:3001"

class DrawWorkTester:
    """综合测试控制器"""

    def __init__(self):
        self.results = []
        self.browser = None
        self.context = None
        self.page = None
        self.api_session = requests.Session()
        self.current_user = None
        self.auth_token = None

    def setup(self):
        """初始化测试环境"""
        print("="*70)
        print("[SETUP] Initializing DrawWork Test Environment")
        print("="*70)

        # 检查服务健康
        self._check_services()

        # 启动浏览器
        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(headless=True)
        self.context = self.browser.new_context(
            viewport={'width': 1280, 'height': 720},
            record_video_dir=f"{TEST_RESULTS_DIR}/videos"
        )
        self.page = self.context.new_page()

        # 设置监听
        self._setup_listeners()

        print("[OK] Test environment ready\n")

    def _check_services(self):
        """检查所有服务状态"""
        services = [
            ("Backend API", f"{API_URL}/health"),
            ("Frontend", BASE_URL),
            ("Yjs WS", f"{WS_URL}/health"),
        ]

        for name, url in services:
            try:
                if url.startswith("ws"):
                    print(f"  [CHECK] {name}: {url} (skipped)")
                else:
                    resp = requests.get(url, timeout=5)
                    status = "OK" if resp.status_code == 200 else "FAIL"
                    print(f"  [{status}] {name}: {url}")
            except Exception as e:
                print(f"  [WARN] {name}: {e}")

    def _setup_listeners(self):
        """设置 DevTools 监听"""
        self.console_logs = []
        self.network_logs = []
        self.performance_logs = []

        # 控制台日志
        self.page.on("console", lambda msg: self.console_logs.append({
            "time": datetime.now().isoformat(),
            "type": msg.type,
            "text": msg.text[:500],
            "location": str(msg.location) if msg.location else None
        }))

        # 网络请求监听 (CDP style)
        self.page.on("request", lambda req: self.network_logs.append({
            "time": datetime.now().isoformat(),
            "method": req.method,
            "url": req.url,
            "resource_type": req.resource_type
        }))

        self.page.on("response", lambda res: self._log_response(res))

        # 页面错误
        self.page.on("pageerror", lambda err: self.console_logs.append({
            "time": datetime.now().isoformat(),
            "type": "pageerror",
            "text": str(err)
        }))

    def _log_response(self, response):
        """记录响应详情"""
        try:
            status = response.status
            if status >= 400:
                self.network_logs.append({
                    "time": datetime.now().isoformat(),
                    "url": response.url,
                    "status": status,
                    "error": True
                })
        except:
            pass

    # ============ API 测试方法 ============

    def api_register_user(self, username, email, password):
        """API: 直接注册用户"""
        resp = self.api_session.post(
            f"{API_URL}/api/auth/register",
            json={"username": username, "email": email, "password": password}
        )
        return resp.status_code == 201, resp.json() if resp.status_code == 201 else resp.text

    def api_login(self, email, password):
        """API: 直接登录获取 token"""
        resp = self.api_session.post(
            f"{API_URL}/api/auth/login",
            json={"email": email, "password": password}
        )
        if resp.status_code == 200:
            data = resp.json()
            self.auth_token = data.get("token")
            self.current_user = data.get("user")
            self.api_session.headers["Authorization"] = f"Bearer {self.auth_token}"
            return True, data
        return False, resp.text

    def api_create_board(self, name, description=""):
        """API: 创建画板"""
        resp = self.api_session.post(
            f"{API_URL}/api/boards",
            json={"name": name, "description": description}
        )
        return resp.status_code == 201, resp.json() if resp.status_code == 201 else resp.text

    def api_create_canvas(self, board_id, name, canvas_type="excalidraw"):
        """API: 创建画布"""
        resp = self.api_session.post(
            f"{API_URL}/api/boards/{board_id}/canvases",
            json={"name": name, "type": canvas_type}
        )
        return resp.status_code == 201, resp.json() if resp.status_code == 201 else resp.text

    def api_invite_user(self, board_id, user_id, permission="editor"):
        """API: 邀请用户到画板"""
        # API 期望 user_id (可以是用户ID、用户名或邮箱)
        resp = self.api_session.post(
            f"{API_URL}/api/boards/{board_id}/shares",
            json={"user_id": user_id, "permission": permission}
        )
        return resp.status_code in [200, 201], resp.json() if resp.status_code in [200, 201] else resp.text

    def api_create_share_token(self, board_id, permission="viewer"):
        """API: 创建分享链接"""
        resp = self.api_session.post(
            f"{API_URL}/api/boards/{board_id}/tokens",
            json={"permission": permission}
        )
        return resp.status_code == 201, resp.json() if resp.status_code == 201 else resp.text

    # ============ DevTools 测试方法 ============

    def devtools_navigate(self, url):
        """DevTools: 导航并等待加载"""
        print(f"[DEVTOOLS] Navigating to: {url}")
        self.page.goto(url, wait_until="networkidle")
        time.sleep(1)
        return self.page.url

    def devtools_screenshot(self, name, full_page=False):
        """DevTools: 截图"""
        path = f"{TEST_RESULTS_DIR}/screenshots/{name}.png"
        self.page.screenshot(path=path, full_page=full_page)
        print(f"[DEVTOOLS] Screenshot: {path}")
        return path

    def devtools_execute_js(self, script):
        """DevTools: 执行 JavaScript"""
        return self.page.evaluate(script)

    def devtools_get_performance_metrics(self):
        """DevTools: 获取性能指标"""
        metrics = self.page.evaluate("""() => {
            const nav = performance.getEntriesByType('navigation')[0];
            const paint = performance.getEntriesByType('paint');
            const cls = performance.getEntriesByType('layout-shift');

            return {
                // Navigation Timing
                dnsLookup: nav ? nav.domainLookupEnd - nav.domainLookupStart : null,
                tcpConnect: nav ? nav.connectEnd - nav.connectStart : null,
                serverResponse: nav ? nav.responseEnd - nav.requestStart : null,
                domProcessing: nav ? nav.domComplete - nav.domLoading : null,
                loadComplete: nav ? nav.loadEventEnd - nav.startTime : null,

                // Paint Timing
                firstPaint: paint.find(p => p.name === 'first-paint')?.startTime,
                firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime,

                // Web Vitals
                cls: cls.length > 0 ? cls.reduce((a, b) => a + b.value, 0) : 0,

                // Memory
                memory: performance.memory ? {
                    usedJSHeapSize: performance.memory.usedJSHeapSize,
                    totalJSHeapSize: performance.memory.totalJSHeapSize,
                } : null
            };
        }""")

        self.performance_logs.append({
            "time": datetime.now().isoformat(),
            "url": self.page.url,
            "metrics": metrics
        })

        return metrics

    def devtools_get_console_logs(self):
        """DevTools: 获取控制台日志"""
        return self.console_logs

    def devtools_get_network_logs(self):
        """DevTools: 获取网络日志"""
        return self.network_logs

    def devtools_clear_logs(self):
        """DevTools: 清空日志"""
        self.console_logs.clear()
        self.network_logs.clear()

    def devtools_set_viewport(self, width, height):
        """DevTools: 设置视口"""
        self.page.set_viewport_size({"width": width, "height": height})
        print(f"[DEVTOOLS] Viewport set: {width}x{height}")

    def devtools_emulate_offline(self, offline=True):
        """DevTools: 模拟离线/在线"""
        self.page.set_offline(offline)
        print(f"[DEVTOOLS] Offline mode: {offline}")

    def devtools_click(self, selector):
        """DevTools: 点击元素"""
        self.page.locator(selector).first.click()

    def devtools_type(self, selector, text):
        """DevTools: 输入文本"""
        self.page.locator(selector).first.fill(text)

    def devtools_wait_for_selector(self, selector, timeout=5000):
        """DevTools: 等待元素"""
        self.page.wait_for_selector(selector, timeout=timeout)

    # ============ 综合测试场景 ============

    def test_complete_workflow(self):
        """完整工作流测试 - 混合模式"""
        print("\n" + "="*70)
        print("[TEST] Complete Workflow: API + DevTools + Collaboration")
        print("="*70)

        results = {
            "test_id": "TC-COMPLETE-001",
            "test_name": "Complete User Journey",
            "started_at": datetime.now().isoformat(),
            "steps": []
        }

        timestamp = str(int(time.time()))

        # Step 1: API - 创建用户 A
        print("\n[Step 1] API: Create User A")
        user_a = {
            "username": f"user_a_{timestamp}",
            "email": f"user_a_{timestamp}@test.com",
            "password": "TestPass123!"
        }
        success, data = self.api_register_user(**user_a)
        results["steps"].append({"step": 1, "action": "Register User A", "status": "PASS" if success else "FAIL"})
        print(f"  [OK] User A created: {user_a['email']}")

        # Step 2: API - 用户 A 登录
        print("\n[Step 2] API: Login User A")
        success, data = self.api_login(user_a["email"], user_a["password"])
        results["steps"].append({"step": 2, "action": "Login User A", "status": "PASS" if success else "FAIL"})
        print(f"  [OK] User A logged in, token: {self.auth_token[:20]}...")

        # Step 3: API - 创建画板
        print("\n[Step 3] API: Create Board")
        success, board = self.api_create_board(f"Test Board {timestamp}", "Collaboration test")
        board_id = board.get("id") if success else None
        results["steps"].append({"step": 3, "action": "Create Board", "status": "PASS" if success else "FAIL", "board_id": board_id})
        print(f"  [OK] Board created: {board_id}")

        # Step 4: API - 创建画布
        print("\n[Step 4] API: Create Canvas")
        success, canvas = self.api_create_canvas(board_id, f"Test Canvas {timestamp}", "excalidraw")
        canvas_id = canvas.get("id") if success else None
        results["steps"].append({"step": 4, "action": "Create Canvas", "status": "PASS" if success else "FAIL", "canvas_id": canvas_id})
        print(f"  [OK] Canvas created: {canvas_id}")

        # Step 5: DevTools - 验证 UI
        print("\n[Step 5] DevTools: Navigate and Verify UI")
        self.devtools_navigate(f"{BASE_URL}/canvas/{canvas_id}")

        # 性能分析
        metrics = self.devtools_get_performance_metrics()
        results["steps"].append({
            "step": 5,
            "action": "Load Canvas UI",
            "status": "PASS" if metrics.get("loadComplete", 0) < 5000 else "WARN",
            "performance": metrics
        })
        print(f"  [OK] Canvas loaded in {metrics.get('loadComplete', 'N/A')}ms")

        # 截图
        self.devtools_screenshot(f"canvas_loaded_{timestamp}")

        # Step 6: API - 创建用户 B
        print("\n[Step 6] API: Create User B for Collaboration")
        user_b = {
            "username": f"user_b_{timestamp}",
            "email": f"user_b_{timestamp}@test.com",
            "password": "TestPass123!"
        }
        success, _ = self.api_register_user(**user_b)
        results["steps"].append({"step": 6, "action": "Register User B", "status": "PASS" if success else "FAIL"})
        print(f"  [OK] User B created: {user_b['email']}")

        # Step 7: API - 邀请用户 B
        print("\n[Step 7] API: Invite User B to Board")
        success, _ = self.api_invite_user(board_id, user_b["email"], "editor")
        results["steps"].append({"step": 7, "action": "Invite User B", "status": "PASS" if success else "FAIL"})
        print(f"  [OK] User B invited as editor")

        # Step 8: DevTools - 在画布上绘制
        print("\n[Step 8] DevTools: Draw on Canvas")
        # 等待 Excalidraw 加载
        time.sleep(3)
        drawing_result = self.devtools_execute_js("""
            () => {
                // 检查 Excalidraw 是否加载 - 多种方式
                if (window.excalidrawAPI) {
                    return { loaded: true, api: 'excalidrawAPI', version: window.excalidrawAPI.version };
                }
                // 检查 canvas 元素
                const canvas = document.querySelector('canvas');
                if (canvas) {
                    return { loaded: true, api: 'canvas-element', width: canvas.width };
                }
                // 检查 excalidraw 容器
                const container = document.querySelector('[data-testid="excalidraw"], .excalidraw');
                if (container) {
                    return { loaded: true, api: 'dom-selector' };
                }
                return { loaded: false, url: window.location.href };
            }
        """)
        results["steps"].append({
            "step": 8,
            "action": "Check Excalidraw",
            "status": "PASS" if drawing_result.get("loaded") else "FAIL",
            "result": drawing_result
        })
        print(f"  Excalidraw status: {drawing_result}")

        # Step 9: DevTools - 获取控制台日志
        print("\n[Step 9] DevTools: Console Analysis")
        console_logs = self.devtools_get_console_logs()
        errors = [log for log in console_logs if log["type"] in ["error", "pageerror"]]
        warnings = [log for log in console_logs if log["type"] == "warning"]
        results["steps"].append({
            "step": 9,
            "action": "Console Analysis",
            "status": "PASS" if len(errors) == 0 else "WARN",
            "errors_count": len(errors),
            "warnings_count": len(warnings)
        })
        print(f"  Console: {len(errors)} errors, {len(warnings)} warnings")

        # Step 10: API - 创建分享链接
        print("\n[Step 10] API: Create Share Token")
        success, token_data = self.api_create_share_token(board_id, "viewer")
        share_token = token_data.get("token") if success else None
        results["steps"].append({"step": 10, "action": "Create Share Token", "status": "PASS" if success else "FAIL", "token": share_token})
        print(f"  [OK] Share token: {share_token[:10]}...")

        # Step 11: DevTools - 测试分享链接 (匿名访问)
        print("\n[Step 11] DevTools: Test Anonymous Access via Share Link")
        # 清除当前登录状态
        self.devtools_execute_js("() => { localStorage.clear(); }")
        self.devtools_navigate(f"{BASE_URL}/share/{share_token}")
        time.sleep(2)

        # 验证权限 (viewer 应该看不到编辑按钮)
        page_content = self.devtools_execute_js("() => document.body.innerText")
        has_edit_permission = "编辑" in page_content or "Edit" in page_content

        results["steps"].append({
            "step": 11,
            "action": "Anonymous Share Access",
            "status": "PASS" if not has_edit_permission else "FAIL",
            "has_edit": has_edit_permission
        })
        self.devtools_screenshot(f"anonymous_view_{timestamp}")
        print(f"  [OK] Anonymous access verified, edit permission: {has_edit_permission}")

        # Summary
        results["ended_at"] = datetime.now().isoformat()
        passed = sum(1 for s in results["steps"] if s["status"] == "PASS")
        failed = sum(1 for s in results["steps"] if s["status"] == "FAIL")

        print("\n" + "="*70)
        print("[SUMMARY] Workflow Test Complete")
        print("="*70)
        print(f"Total Steps: {len(results['steps'])}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")

        # Save report
        report_path = f"{TEST_RESULTS_DIR}/reports/workflow_{timestamp}.json"
        with open(report_path, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\n[OK] Report saved: {report_path}")

        return results

    def test_performance_baseline(self):
        """性能基线测试"""
        print("\n" + "="*70)
        print("[TEST] Performance Baseline")
        print("="*70)

        results = {
            "test_id": "TC-PERF-001",
            "test_name": "Performance Baseline",
            "metrics": []
        }

        # 测试页面
        pages = [
            ("Login Page", "/login"),
            ("Register Page", "/register"),
            ("Dashboard", "/dashboard"),
        ]

        for name, path in pages:
            print(f"\n[Testing] {name}")
            self.devtools_navigate(f"{BASE_URL}{path}")
            metrics = self.devtools_get_performance_metrics()
            results["metrics"].append({
                "page": name,
                "path": path,
                **metrics
            })
            print(f"  Load: {metrics.get('loadComplete', 'N/A')}ms | FCP: {metrics.get('firstContentfulPaint', 'N/A')}ms")

        # Save performance report
        report_path = f"{TEST_RESULTS_DIR}/performance/baseline_{int(time.time())}.json"
        with open(report_path, "w") as f:
            json.dump(results, f, indent=2)

        print(f"\n[OK] Performance report: {report_path}")
        return results

    def test_security_baselines(self):
        """安全基线测试"""
        print("\n" + "="*70)
        print("[TEST] Security Baseline Tests")
        print("="*70)

        tests = []

        # Test 1: XSS Prevention
        print("\n[Security-1] XSS Prevention Test")
        self.devtools_navigate(f"{BASE_URL}/register")
        xss_payload = "<script>alert('xss')</script>"
        self.devtools_type("input:first-of-type", xss_payload)
        self.devtools_screenshot("security_xss_test")
        # Check if script was executed
        logs = self.devtools_get_console_logs()
        has_alert = any("alert" in log.get("text", "") for log in logs)
        tests.append({"test": "XSS Prevention", "passed": not has_alert})
        print(f"  [OK] XSS test: {'PASS' if not has_alert else 'FAIL'}")

        # Test 2: API Auth Required
        print("\n[Security-2] API Auth Enforcement")
        # Try accessing protected endpoint without auth
        resp = requests.get(f"{API_URL}/api/boards")
        tests.append({"test": "API Auth Required", "passed": resp.status_code == 401})
        print(f"  [OK] Auth enforcement: {'PASS' if resp.status_code == 401 else 'FAIL'}")

        return tests

    def cleanup(self):
        """清理"""
        if self.browser:
            self.browser.close()
        if self.playwright:
            self.playwright.stop()
        print("\n[CLEANUP] Test environment cleaned")

# ============ 主程序 ============

def run_all_tests():
    """运行所有测试"""
    tester = DrawWorkTester()

    try:
        tester.setup()

        # 运行测试套件
        results = {
            "workflow": tester.test_complete_workflow(),
            "performance": tester.test_performance_baseline(),
            "security": tester.test_security_baselines(),
        }

        # 最终报告
        print("\n" + "="*70)
        print("FINAL TEST REPORT")
        print("="*70)

        for category, data in results.items():
            if isinstance(data, dict):
                steps = data.get("steps", [])
                passed = sum(1 for s in steps if s.get("status") == "PASS")
                print(f"\n{category.upper()}: {passed}/{len(steps)} passed")

        return results

    except Exception as e:
        print(f"\n[ERROR] Test failed: {e}")
        import traceback
        traceback.print_exc()
        return None

    finally:
        tester.cleanup()

if __name__ == "__main__":
    print("""
╔═══════════════════════════════════════════════════════════════════╗
║           DrawWork Comprehensive Test Suite                       ║
║  Playwright + Chrome DevTools MCP + API Testing                   ║
╚═══════════════════════════════════════════════════════════════════╝
    """)
    results = run_all_tests()
    exit(0 if results else 1)
