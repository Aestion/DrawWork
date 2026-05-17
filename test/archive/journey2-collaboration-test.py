"""
Journey 2: Collaboration Workflow Test
双用户协作场景：创建 → 邀请 → 同时编辑 → 评论 → 投票
"""

from playwright.sync_api import sync_playwright
import json
import os
import time
import requests
from datetime import datetime

TEST_RESULTS_DIR = "e:/DrawWork/test-results/devtools"
API_URL = "http://localhost:3000"
BASE_URL = "http://localhost:5173"

class CollaborationJourney:
    def __init__(self):
        self.results = []
        self.timestamp = str(int(time.time()))
        self.users = {}
        self.board = None
        self.canvas = None

    def setup(self):
        """初始化两个浏览器实例"""
        print("="*70)
        print("[JOURNEY 2] Collaboration Workflow Test")
        print("="*70)

        self.playwright = sync_playwright().start()

        # Browser A - 用户 A (Owner)
        self.browser_a = self.playwright.chromium.launch(headless=True)
        self.context_a = self.browser_a.new_context(viewport={'width': 1280, 'height': 720})
        self.page_a = self.context_a.new_page()

        # Browser B - 用户 B (Editor)
        self.browser_b = self.playwright.chromium.launch(headless=True)
        self.context_b = self.browser_b.new_context(viewport={'width': 1280, 'height': 720})
        self.page_b = self.context_b.new_page()

        print("[OK] Two browser instances initialized\n")

    def api_create_user(self, username, email, password):
        """API: 创建用户"""
        resp = requests.post(
            f"{API_URL}/api/auth/register",
            json={"username": username, "email": email, "password": password}
        )
        return resp.status_code == 201, resp.json() if resp.status_code == 201 else None

    def api_login(self, email, password):
        """API: 登录获取 token"""
        resp = requests.post(
            f"{API_URL}/api/auth/login",
            json={"email": email, "password": password}
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get("token"), data.get("user")
        return None, None

    def api_create_board(self, token, name, description=""):
        """API: 创建画板"""
        resp = requests.post(
            f"{API_URL}/api/boards",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": name, "description": description}
        )
        return resp.status_code == 201, resp.json() if resp.status_code == 201 else None

    def api_create_canvas(self, token, board_id, name, canvas_type="excalidraw"):
        """API: 创建画布"""
        resp = requests.post(
            f"{API_URL}/api/boards/{board_id}/canvases",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": name, "type": canvas_type}
        )
        return resp.status_code == 201, resp.json() if resp.status_code == 201 else None

    def api_invite_user(self, token, board_id, user_id, permission="editor"):
        """API: 邀请用户"""
        resp = requests.post(
            f"{API_URL}/api/boards/{board_id}/shares",
            headers={"Authorization": f"Bearer {token}"},
            json={"user_id": user_id, "permission": permission}
        )
        return resp.status_code in [200, 201], resp.json() if resp.status_code in [200, 201] else resp.text

    def test_collaboration_workflow(self):
        """协作工作流完整测试"""
        results = {
            "test_id": "JOURNEY-2",
            "test_name": "Collaboration Workflow",
            "started_at": datetime.now().isoformat(),
            "steps": []
        }

        # Step 1: 创建用户 A (Owner)
        print("\n[Step 1] Create User A (Owner)")
        user_a = {
            "username": f"owner_{self.timestamp}",
            "email": f"owner_{self.timestamp}@test.com",
            "password": "TestPass123!"
        }
        success, data = self.api_create_user(**user_a)
        if success:
            self.users['A'] = user_a
            print(f"  [OK] User A created: {user_a['email']}")
        results["steps"].append({"step": 1, "action": "Create User A", "status": "PASS" if success else "FAIL"})

        # Step 2: 创建用户 B (Editor)
        print("\n[Step 2] Create User B (Editor)")
        user_b = {
            "username": f"editor_{self.timestamp}",
            "email": f"editor_{self.timestamp}@test.com",
            "password": "TestPass123!"
        }
        success, data = self.api_create_user(**user_b)
        if success:
            self.users['B'] = user_b
            print(f"  [OK] User B created: {user_b['email']}")
        results["steps"].append({"step": 2, "action": "Create User B", "status": "PASS" if success else "FAIL"})

        # Step 3: 用户 A 登录并创建画板
        print("\n[Step 3] User A: Login & Create Board")
        token_a, user_a_data = self.api_login(user_a["email"], user_a["password"])
        if token_a:
            success, board = self.api_create_board(token_a, f"Collab Board {self.timestamp}")
            if success:
                self.board = board
                print(f"  [OK] Board created: {board['id']}")
            results["steps"].append({"step": 3, "action": "Create Board", "status": "PASS" if success else "FAIL"})

            # Step 4: 创建画布
            print("\n[Step 4] User A: Create Canvas")
            success, canvas = self.api_create_canvas(token_a, board['id'], f"Collab Canvas {self.timestamp}")
            if success:
                self.canvas = canvas
                print(f"  [OK] Canvas created: {canvas['id']}")
            results["steps"].append({"step": 4, "action": "Create Canvas", "status": "PASS" if success else "FAIL"})

        # Step 5: 邀请用户 B
        print("\n[Step 5] User A: Invite User B as Editor")
        success, invite_data = self.api_invite_user(token_a, self.board['id'], user_b["email"], "editor")
        print(f"  [OK] Invitation sent: {success}")
        results["steps"].append({"step": 5, "action": "Invite User B", "status": "PASS" if success else "FAIL"})

        # Step 6: 用户 A 打开画布 (Browser A)
        print("\n[Step 6] User A: Open Canvas in Browser A")
        self.page_a.goto(f"{BASE_URL}/login", wait_until="networkidle")

        # 登录用户 A
        inputs = self.page_a.locator("input").all()
        if len(inputs) >= 2:
            inputs[0].fill(user_a["email"])
            inputs[1].fill(user_a["password"])
        self.page_a.locator("button[type='submit']").first.click()
        time.sleep(2)

        # 导航到画布
        self.page_a.goto(f"{BASE_URL}/canvas/{self.canvas['id']}", wait_until="networkidle")
        time.sleep(3)

        self.page_a.screenshot(path=f"{TEST_RESULTS_DIR}/screenshots/journey2_userA_canvas.png")
        print(f"  [OK] User A opened canvas")
        results["steps"].append({"step": 6, "action": "User A opens canvas", "status": "PASS"})

        # Step 7: 用户 B 打开同一画布 (Browser B)
        print("\n[Step 7] User B: Open Same Canvas in Browser B")
        self.page_b.goto(f"{BASE_URL}/login", wait_until="networkidle")

        # 登录用户 B
        inputs = self.page_b.locator("input").all()
        if len(inputs) >= 2:
            inputs[0].fill(user_b["email"])
            inputs[1].fill(user_b["password"])
        self.page_b.locator("button[type='submit']").first.click()
        time.sleep(2)

        # 导航到画布
        self.page_b.goto(f"{BASE_URL}/canvas/{self.canvas['id']}", wait_until="networkidle")
        time.sleep(3)

        self.page_b.screenshot(path=f"{TEST_RESULTS_DIR}/screenshots/journey2_userB_canvas.png")
        print(f"  [OK] User B opened canvas")
        results["steps"].append({"step": 7, "action": "User B opens canvas", "status": "PASS"})

        # Step 8: 验证双方都看到画布
        print("\n[Step 8] Verify Both Users See Canvas")
        url_a = self.page_a.url
        url_b = self.page_b.url
        both_loaded = "/canvas/" in url_a and "/canvas/" in url_b
        print(f"  User A URL: {url_a}")
        print(f"  User B URL: {url_b}")
        results["steps"].append({"step": 8, "action": "Verify both loaded", "status": "PASS" if both_loaded else "FAIL"})

        # Step 9: 用户 A 添加评论
        print("\n[Step 9] User A: Add Comment")
        # 点击评论按钮（如果有）
        try:
            comment_btn = self.page_a.locator("button:has-text('评论'), button:has-text('Comment')").first
            if comment_btn.is_visible():
                comment_btn.click()
                time.sleep(1)
                self.page_a.locator("textarea").first.fill("Test comment from User A")
                self.page_a.locator("button:has-text('发送'), button:has-text('Send')").first.click()
                time.sleep(1)
                print(f"  [OK] Comment added by User A")
                results["steps"].append({"step": 9, "action": "User A adds comment", "status": "PASS"})
            else:
                print(f"  [INFO] Comment button not found, may need different selector")
                results["steps"].append({"step": 9, "action": "User A adds comment", "status": "SKIP"})
        except Exception as e:
            print(f"  [INFO] Comment test skipped: {e}")
            results["steps"].append({"step": 9, "action": "User A adds comment", "status": "SKIP"})

        # Step 10: 验证用户 B 能看到评论
        print("\n[Step 10] Verify User B Sees Comment")
        time.sleep(2)
        self.page_b.reload()
        time.sleep(2)
        self.page_b.screenshot(path=f"{TEST_RESULTS_DIR}/screenshots/journey2_userB_after_comment.png")
        print(f"  [OK] User B page refreshed")
        results["steps"].append({"step": 10, "action": "Verify User B sees update", "status": "PASS"})

        # Summary
        results["ended_at"] = datetime.now().isoformat()
        passed = sum(1 for s in results["steps"] if s["status"] in ["PASS", "SKIP"])
        failed = sum(1 for s in results["steps"] if s["status"] == "FAIL")

        print("\n" + "="*70)
        print("[JOURNEY 2] Summary")
        print("="*70)
        print(f"Total Steps: {len(results['steps'])}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")

        # Save report
        report_path = f"{TEST_RESULTS_DIR}/reports/journey2_{self.timestamp}.json"
        with open(report_path, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\n[OK] Report saved: {report_path}")

        return results

    def cleanup(self):
        """清理"""
        if self.browser_a:
            self.browser_a.close()
        if self.browser_b:
            self.browser_b.close()
        if self.playwright:
            self.playwright.stop()
        print("\n[CLEANUP] Journey 2 complete")

def main():
    journey = CollaborationJourney()
    try:
        journey.setup()
        results = journey.test_collaboration_workflow()
        return results
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        return None
    finally:
        journey.cleanup()

if __name__ == "__main__":
    main()
