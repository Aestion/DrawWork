"""
TC-004: User Login Flow Test
"""
from playwright.sync_api import sync_playwright
import json
import os

TEST_RESULTS_DIR = "e:/DrawWork/test-results/devtools/phase1"
os.makedirs(TEST_RESULTS_DIR, exist_ok=True)

def test_login():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = context.new_page()

        console_logs = []
        page.on("console", lambda msg: console_logs.append({
            "type": msg.type,
            "text": msg.text[:200]
        }))

        # 1. Navigate to login page
        print("[TC-004] Navigating to login page")
        page.goto("http://localhost:5173/login", wait_until="networkidle")
        page.wait_for_timeout(2000)

        # Screenshot - initial state
        page.screenshot(path=f"{TEST_RESULTS_DIR}/tc004_login_initial.png")
        print("[INFO] Initial state screenshot saved")

        # 2. Get initial LocalStorage state
        initial_storage = page.evaluate("() => localStorage.getItem('token')")
        print(f"[INFO] Initial token: {initial_storage}")

        # 3. Fill login form - flexible selectors
        print("[INFO] Filling login form")

        # Wait for form elements
        page.wait_for_selector("input", timeout=10000)

        # Get all inputs and fill them
        inputs = page.locator("input").all()
        print(f"[INFO] Found {len(inputs)} input fields")

        if len(inputs) >= 2:
            inputs[0].fill("123@qq.com")
            inputs[1].fill("123456")
            print("[INFO] Filled email and password")
        else:
            print("[WARN] Not enough input fields found")
            # Try by type
            try:
                page.locator("input[type='email']").fill("123@qq.com")
                page.locator("input[type='password']").fill("123456")
            except:
                print("[ERROR] Could not find email/password fields")
                browser.close()
                return {"status": "FAIL", "error": "Fields not found"}

        page.screenshot(path=f"{TEST_RESULTS_DIR}/tc004_login_filled.png")
        print("[INFO] Filled form screenshot saved")

        # 4. Click login button
        print("[INFO] Clicking login button")
        try:
            # Try different button selectors
            submit_button = page.locator("button[type='submit']").first
            if submit_button.is_visible():
                submit_button.click()
            else:
                # Try by text
                page.locator("button:has-text('登录'), button:has-text('Login')").first.click()
        except Exception as e:
            print(f"[WARN] Could not click submit button: {e}")

        # 5. Wait for response
        page.wait_for_timeout(3000)

        # Check if redirected
        final_url = page.url
        login_success = "/dashboard" in final_url or "/canvas" in final_url or final_url != "http://localhost:5173/login"

        if login_success:
            print("[PASS] Login successful or page changed")
        else:
            print("[INFO] Page may show error or stayed on login")

        # 6. Get post-login state
        final_storage = page.evaluate("() => localStorage.getItem('token')")
        print(f"[INFO] Final URL: {final_url}")
        print(f"[INFO] Token after login: {'Present' if final_storage else 'Missing'}")

        # 7. Screenshot - final state
        page.screenshot(path=f"{TEST_RESULTS_DIR}/tc004_login_result.png", full_page=True)
        print("[INFO] Login result screenshot saved")

        # Save report
        report = {
            "test_id": "TC-004",
            "test_name": "User Login Flow Test",
            "status": "PASS" if final_storage else "FAIL",
            "initial_url": "http://localhost:5173/login",
            "final_url": final_url,
            "login_success": login_success,
            "has_token": bool(final_storage),
            "console_errors": [log for log in console_logs if log["type"] == "error"],
            "screenshots": {
                "initial": f"{TEST_RESULTS_DIR}/tc004_login_initial.png",
                "filled": f"{TEST_RESULTS_DIR}/tc004_login_filled.png",
                "result": f"{TEST_RESULTS_DIR}/tc004_login_result.png"
            }
        }

        report_path = f"{TEST_RESULTS_DIR}/tc004_report.json"
        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)

        # Output summary
        print("\n" + "="*50)
        print("[TC-004] Test Summary")
        print("="*50)
        print(f"Status: {'PASS' if report['status'] == 'PASS' else 'FAIL'}")
        print(f"Login Success: {'Yes' if login_success else 'No'}")
        print(f"Token Acquired: {'Yes' if final_storage else 'No'}")
        print(f"Final URL: {final_url}")
        print(f"Console Errors: {len(report['console_errors'])}")

        browser.close()
        return report

if __name__ == "__main__":
    result = test_login()
    exit(0 if result["status"] == "PASS" else 1)
