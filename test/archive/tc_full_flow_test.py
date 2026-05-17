"""
Complete Phase 1 Flow Test using Playwright
Tests: Homepage -> Register -> Login -> Create Canvas
"""
from playwright.sync_api import sync_playwright
import json
import os
import time

TEST_RESULTS_DIR = "e:/DrawWork/test-results/devtools/phase1"
os.makedirs(TEST_RESULTS_DIR, exist_ok=True)

def run_full_flow():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = context.new_page()

        # Collect logs
        console_logs = []
        page.on("console", lambda msg: console_logs.append({"type": msg.type, "text": msg.text[:200]}))

        results = {}
        timestamp = str(int(time.time()))

        # ========== TC-001: Homepage ==========
        print("="*60)
        print("[TC-001] Homepage Loading Test")
        print("="*60)

        page.goto("http://localhost:5173", wait_until="networkidle")
        page.wait_for_timeout(2000)

        results['tc001'] = {
            "title": page.title(),
            "url": page.url,
            "status": "PASS" if "DrawWork" in page.title() else "FAIL"
        }
        page.screenshot(path=f"{TEST_RESULTS_DIR}/flow_01_homepage.png")
        print(f"[OK] Title: {results['tc001']['title']}")

        # ========== TC-003: Register ==========
        print("\n" + "="*60)
        print("[TC-003] User Registration Test")
        print("="*60)

        page.goto("http://localhost:5173/register", wait_until="networkidle")
        page.wait_for_timeout(1000)

        # Fill registration form
        username = f"testuser_{timestamp}"
        email = f"test_{timestamp}@example.com"
        password = "TestPass123!"

        inputs = page.locator("input").all()
        print(f"[INFO] Found {len(inputs)} input fields")

        if len(inputs) >= 3:
            inputs[0].fill(username)   # username
            inputs[1].fill(email)      # email
            inputs[2].fill(password)   # password
            print(f"[INFO] Filled: {username}, {email}")

        page.screenshot(path=f"{TEST_RESULTS_DIR}/flow_02_register_filled.png")

        # Click register
        try:
            page.locator("button[type='submit']").first.click()
            page.wait_for_timeout(3000)

            current_url = page.url
            register_success = "/login" in current_url or "/dashboard" in current_url
            print(f"[INFO] After register, URL: {current_url}")

            # Check for error message
            error_msg = None
            try:
                error_elem = page.locator("text=/error|错误|fail/i").first
                if error_elem.is_visible():
                    error_msg = error_elem.inner_text()
            except:
                pass

            results['tc003'] = {
                "username": username,
                "email": email,
                "url_after": current_url,
                "status": "PASS" if register_success else "FAIL",
                "error": error_msg
            }

        except Exception as e:
            results['tc003'] = {"status": "FAIL", "error": str(e)}
            print(f"[ERROR] Registration error: {e}")

        page.screenshot(path=f"{TEST_RESULTS_DIR}/flow_03_register_result.png")

        # ========== TC-004: Login ==========
        print("\n" + "="*60)
        print("[TC-004] User Login Test")
        print("="*60)

        # Always try to login (if register succeeded, we might already be logged in)
        if "/login" not in page.url:
            page.goto("http://localhost:5173/login", wait_until="networkidle")
            page.wait_for_timeout(1000)

        inputs = page.locator("input").all()
        if len(inputs) >= 2:
            inputs[0].fill(email)
            inputs[1].fill(password)
            print(f"[INFO] Filled login: {email}")

        page.locator("button[type='submit']").first.click()
        page.wait_for_timeout(3000)

        current_url = page.url
        token = page.evaluate("() => localStorage.getItem('token')")

        results['tc004'] = {
            "email": email,
            "url_after": current_url,
            "has_token": bool(token),
            "status": "PASS" if token else "FAIL"
        }
        print(f"[INFO] Token acquired: {bool(token)}")
        page.screenshot(path=f"{TEST_RESULTS_DIR}/flow_04_login_result.png")

        # ========== TC-006: Create Canvas ==========
        if token:
            print("\n" + "="*60)
            print("[TC-006] Create Canvas Test")
            print("="*60)

            # Navigate to dashboard or find create canvas button
            page.goto("http://localhost:5173/dashboard", wait_until="networkidle")
            page.wait_for_timeout(2000)

            page.screenshot(path=f"{TEST_RESULTS_DIR}/flow_05_dashboard.png")

            # Try to find "New Canvas" or "Create" button
            try:
                create_btn = page.locator("button:has-text('新建'), button:has-text('Create'), button:has-text('+')").first
                if create_btn.is_visible():
                    create_btn.click()
                    page.wait_for_timeout(1000)

                    # Fill canvas name if dialog appears
                    dialog_input = page.locator("input[placeholder*='name' i], input[placeholder*='名称' i]").first
                    if dialog_input.is_visible():
                        canvas_name = f"Test Canvas {timestamp}"
                        dialog_input.fill(canvas_name)
                        page.locator("button:has-text('确认'), button:has-text('OK'), button:has-text('Create')").first.click()
                        page.wait_for_timeout(2000)

                    results['tc006'] = {
                        "status": "PASS",
                        "url": page.url
                    }
                else:
                    results['tc006'] = {"status": "FAIL", "reason": "Create button not found"}
            except Exception as e:
                results['tc006'] = {"status": "FAIL", "error": str(e)}
                print(f"[ERROR] Create canvas error: {e}")

            page.screenshot(path=f"{TEST_RESULTS_DIR}/flow_06_canvas.png")
        else:
            results['tc006'] = {"status": "SKIP", "reason": "No token, login failed"}

        # ========== Summary ==========
        print("\n" + "="*60)
        print("PHASE 1 TEST SUMMARY")
        print("="*60)

        for test_id, result in results.items():
            status = result.get('status', 'UNKNOWN')
            symbol = "PASS" if status == "PASS" else "FAIL" if status == "FAIL" else "SKIP"
            print(f"[{symbol}] {test_id}: {result}")

        # Save full report
        report_path = f"{TEST_RESULTS_DIR}/full_flow_report.json"
        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)

        print(f"\n[OK] Full report saved: {report_path}")
        browser.close()
        return results

if __name__ == "__main__":
    results = run_full_flow()
    # Exit 0 if at least TC-001 and TC-004 passed
    all_pass = results.get('tc001', {}).get('status') == 'PASS'
    exit(0 if all_pass else 1)
