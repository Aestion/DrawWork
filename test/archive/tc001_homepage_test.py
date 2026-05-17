"""
TC-001: 首页加载测试 (独立模式)
使用 Playwright 直接启动浏览器测试
"""
from playwright.sync_api import sync_playwright
import json
import os

TEST_RESULTS_DIR = "e:/DrawWork/test-results/devtools/phase1"
os.makedirs(TEST_RESULTS_DIR, exist_ok=True)

def test_homepage():
    with sync_playwright() as p:
        # 直接启动 Chromium
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = context.new_page()

        # 设置控制台日志监听
        console_logs = []
        page.on("console", lambda msg: console_logs.append({
            "type": msg.type,
            "text": msg.text[:200]  # 限制长度
        }))

        # 监听网络错误
        failed_requests = []
        page.on("requestfailed", lambda req: failed_requests.append({
            "url": req.url,
            "error": str(req.failure)
        }))

        # 导航到首页
        print("[TC-001] Navigating to http://localhost:5173")
        try:
            page.goto("http://localhost:5173", wait_until="networkidle", timeout=30000)
        except Exception as e:
            print(f"[ERROR] Page load failed: {e}")
            return {"status": "FAIL", "error": str(e)}

        # 等待页面稳定
        page.wait_for_timeout(2000)

        # 获取页面信息
        title = page.title()
        url = page.url

        print(f"[INFO] Page title: {title}")
        print(f"[INFO] Current URL: {url}")

        # 截图
        screenshot_path = f"{TEST_RESULTS_DIR}/tc001_homepage.png"
        page.screenshot(path=screenshot_path, full_page=True)
        print(f"[INFO] Screenshot saved: {screenshot_path}")

        # 获取性能指标
        try:
            performance = page.evaluate("""() => {
                const nav = performance.getEntriesByType('navigation')[0];
                const paint = performance.getEntriesByType('paint');
                return {
                    loadTime: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null,
                    domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
                    firstPaint: paint.find(p => p.name === 'first-paint')?.startTime,
                    firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime
                };
            }""")
        except:
            performance = {}

        # 保存控制台日志
        logs_path = f"{TEST_RESULTS_DIR}/tc001_console_logs.json"
        with open(logs_path, 'w', encoding='utf-8') as f:
            json.dump({"logs": console_logs, "failed_requests": failed_requests}, f, indent=2, ensure_ascii=False)

        # 生成报告
        errors = [log for log in console_logs if log["type"] == "error"]
        warnings = [log for log in console_logs if log["type"] == "warning"]

        status = "PASS" if title else "FAIL"

        report = {
            "test_id": "TC-001",
            "test_name": "首页加载测试",
            "status": status,
            "page_title": title,
            "url": url,
            "performance": performance,
            "console_errors_count": len(errors),
            "console_warnings_count": len(warnings),
            "failed_requests_count": len(failed_requests),
            "screenshot": screenshot_path,
            "logs_file": logs_path
        }

        report_path = f"{TEST_RESULTS_DIR}/tc001_report.json"
        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)

        # 输出摘要
        print("\n" + "="*50)
        print("[TC-001] Test Summary")
        print("="*50)
        print(f"Status: {'PASS' if status == 'PASS' else 'FAIL'}")
        print(f"Load Time: {performance.get('loadTime', 'N/A')}ms")
        print(f"FCP: {performance.get('firstContentfulPaint', 'N/A')}ms")
        print(f"Console Errors: {len(errors)}")
        print(f"Console Warnings: {len(warnings)}")
        print(f"Failed Requests: {len(failed_requests)}")

        browser.close()
        return report

if __name__ == "__main__":
    result = test_homepage()
    exit(0 if result.get("status") == "PASS" else 1)
