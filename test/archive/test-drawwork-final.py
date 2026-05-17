#!/usr/bin/env python3
"""
DrawWork E2E Test - Using Playwright
Simulate user: register, create board, create canvas, draw
"""

from playwright.sync_api import sync_playwright
import uuid
import os

BASE_URL = "http://localhost:5173"
SCREENSHOT_DIR = "e:/DrawWork/test-screenshots"

os.makedirs(SCREENSHOT_DIR, exist_ok=True)

TEST_USER = {
    "username": f"user_{uuid.uuid4().hex[:6]}",
    "email": f"test_{uuid.uuid4().hex[:6]}@test.com",
    "password": "Test123456!"
}

def screenshot(page, name):
    path = f"{SCREENSHOT_DIR}/{name}.png"
    page.screenshot(path=path, full_page=True)
    print(f"[OK] Screenshot: {name}.png")
    return path

def test_drawwork():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=300)
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        try:
            print("\n[Step 1] Visit homepage")
            page.goto(BASE_URL)
            page.wait_for_load_state('networkidle')
            screenshot(page, "01_homepage")

            print("[Step 2] Go to register page")
            # Direct navigate to register
            page.goto(f"{BASE_URL}/register")
            page.wait_for_timeout(1000)
            page.wait_for_load_state('networkidle')
            screenshot(page, "02_register_page")

            print("[Step 3] Fill register form")
            # Wait for form to be ready
            page.wait_for_selector('input', timeout=10000)
            # Use more flexible selectors
            inputs = page.locator('input').all()
            if len(inputs) >= 3:
                inputs[0].fill(TEST_USER["username"])  # username
                inputs[1].fill(TEST_USER["email"])     # email
                inputs[2].fill(TEST_USER["password"])  # password
            screenshot(page, "03_register_form")

            print("[Step 4] Submit registration")
            page.click('button[type="submit"]')
            page.wait_for_timeout(2000)
            page.wait_for_load_state('networkidle')
            screenshot(page, "04_registered")

            print("[Step 5] Create board")
            page.wait_for_timeout(1000)
            page.click('button:has-text("新建画板")')
            page.wait_for_timeout(800)
            screenshot(page, "05_create_board_dialog")

            board_name = f"Board_{uuid.uuid4().hex[:4]}"
            # Fill the first input in the dialog (board name)
            inputs = page.locator('input').all()
            for inp in inputs:
                if inp.is_visible():
                    inp.fill(board_name)
                    break
            page.click('button:has-text("创建")')
            page.wait_for_timeout(2000)
            screenshot(page, "06_board_created")

            print("[Step 6] Enter board")
            # Click on the board card to enter
            page.click(f'text={board_name}')
            page.wait_for_timeout(2000)
            screenshot(page, "07_board_detail")

            print("[Step 7] Canvas already opened")
            # Wait for Excalidraw to be ready
            page.wait_for_timeout(3000)
            screenshot(page, "08_canvas_opened")

            print("[Step 8] Draw in Excalidraw")
            # Wait for canvas to be ready
            page.wait_for_selector('canvas', timeout=10000)
            screenshot(page, "09_editor_ready")

            # Get canvas and draw
            canvas = page.locator('canvas').first
            box = canvas.bounding_box()
            if box:
                cx, cy = box['x'] + box['width']/2, box['y'] + box['height']/2

                # Draw rectangle
                print("  Drawing rectangle...")
                page.mouse.move(cx - 100, cy - 50)
                page.mouse.down()
                page.mouse.move(cx + 100, cy + 50)
                page.mouse.up()
                page.wait_for_timeout(1000)
                screenshot(page, "11_drew_rectangle")

            print("\n" + "="*50)
            print("SUCCESS: E2E test completed!")
            print("="*50)
            print(f"User: {TEST_USER['username']}")
            print(f"Board: {board_name}")
            print(f"Screenshots: {SCREENSHOT_DIR}/")

        except Exception as e:
            print(f"\n[FAIL] Test failed: {e}")
            screenshot(page, "error")
            raise
        finally:
            browser.close()

if __name__ == "__main__":
    test_drawwork()
