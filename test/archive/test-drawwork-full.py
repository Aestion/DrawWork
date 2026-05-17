#!/usr/bin/env python3
"""
DrawWork 完整 E2E 测试 - 使用 Playwright + 截图分析
模拟用户：注册 → 登录 → 创建画板 → 创建画布 → 绘制
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
        # 启动浏览器（可见模式，便于观察）
        browser = p.chromium.launch(headless=False, slow_mo=300)
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        try:
            # ========== Step 1: 访问首页 ==========
            print("\n[Step 1] 访问首页...")
            page.goto(BASE_URL)
            page.wait_for_load_state('networkidle')
            screenshot(page, "01_homepage")

            # ========== Step 2: 注册 ==========
            print("[Step 2] 注册新用户...")
            # 点击"去注册"链接
            page.click('text=去注册, a:has-text("注册")')
            page.wait_for_timeout(1000)
            page.wait_for_load_state('networkidle')
            screenshot(page, "02_register_page")

            page.fill('input[name="username"]', TEST_USER["username"])
            page.fill('input[name="email"]', TEST_USER["email"])
            page.fill('input[name="password"]', TEST_USER["password"])
            screenshot(page, "02_register_form")

            page.click('button[type="submit"]')
            page.wait_for_timeout(2000)
            screenshot(page, "03_registered")

            # ========== Step 3: 创建画板 ==========
            print("[Step 3] 创建画板...")
            # 等待仪表盘加载
            page.wait_for_selector('button:has-text("新建画板")', timeout=10000)
            page.click('button:has-text("新建画板")')
            page.wait_for_timeout(800)
            screenshot(page, "04_create_board_dialog")

            board_name = f"Board_{uuid.uuid4().hex[:4]}"
            page.fill('input[name="name"]', board_name)
            page.click('button:has-text("创建")')
            page.wait_for_timeout(2000)
            screenshot(page, "05_board_created")

            # ========== Step 4: 进入画板 ==========
            print("[Step 4] 进入画板...")
            # 点击画板卡片
            page.click(f'text={board_name}')
            page.wait_for_timeout(2000)
            screenshot(page, "06_board_detail")

            # ========== Step 5: 创建画布 ==========
            print("[Step 5] 创建画布...")
            page.click('button:has-text("新增画布")')
            page.wait_for_timeout(800)
            screenshot(page, "07_create_canvas_dialog")

            canvas_name = f"Canvas_{uuid.uuid4().hex[:4]}"
            page.fill('input[name="name"]', canvas_name)

            # 选择白板类型
            if page.locator('select[name="type"]').is_visible():
                page.select_option('select[name="type"]', 'excalidraw')

            page.click('button:has-text("创建")')
            page.wait_for_timeout(3000)
            screenshot(page, "08_canvas_opened")

            # ========== Step 6: 在 Excalidraw 中绘制 ==========
            print("[Step 6] 绘制图形...")

            # 等待编辑器加载
            page.wait_for_selector('canvas', timeout=10000)

            # 查找矩形工具按钮
            tools = page.locator('.ToolButton, button[title]').all()
            print(f"  Found {len(tools)} tool buttons")

            # 点击第二个工具（通常是矩形）
            if len(tools) >= 2:
                tools[1].click()
                page.wait_for_timeout(500)
                screenshot(page, "09_rect_tool")

            # 在画布上绘制矩形
            canvas = page.locator('canvas').first
            box = canvas.bounding_box()
            if box:
                cx, cy = box['x'] + box['width']/2, box['y'] + box['height']/2

                # 绘制矩形
                page.mouse.move(cx - 100, cy - 50)
                page.mouse.down()
                page.mouse.move(cx + 100, cy + 50)
                page.mouse.up()
                page.wait_for_timeout(1000)
                screenshot(page, "10_drew_rectangle")

                # 选择椭圆工具
                if len(tools) >= 3:
                    tools[2].click()
                    page.wait_for_timeout(500)

                    # 绘制椭圆
                    page.mouse.move(cx + 150, cy - 50)
                    page.mouse.down()
                    page.mouse.move(cx + 250, cy + 50)
                    page.mouse.up()
                    page.wait_for_timeout(1000)
                    screenshot(page, "11_drew_ellipse")

                # 选择文本工具
                text_tool = page.locator('button[title*="text"], button[title*="文本"]').first
                if text_tool.is_visible():
                    text_tool.click()
                    page.wait_for_timeout(500)
                    page.mouse.click(cx, cy - 150)
                    page.wait_for_timeout(500)
                    page.keyboard.type("Hello DrawWork!")
                    page.wait_for_timeout(1000)
                    screenshot(page, "12_added_text")

            print("\n" + "="*50)
            print("✅ E2E 测试成功完成!")
            print("="*50)
            print(f"用户: {TEST_USER['username']}")
            print(f"画板: {board_name}")
            print(f"画布: {canvas_name}")
            print(f"截图: {SCREENSHOT_DIR}/")

        except Exception as e:
            print(f"\n❌ 测试失败: {e}")
            screenshot(page, "error")
            raise
        finally:
            browser.close()

if __name__ == "__main__":
    test_drawwork()
