#!/usr/bin/env python3
"""
DrawWork E2E 测试脚本
模拟真实用户：注册 → 登录 → 创建画板 → 进入画板 → 创建画布 → 绘制图形
"""

from playwright.sync_api import sync_playwright, expect
import time
import uuid

# 基础配置
BASE_URL = "http://localhost:5173"
API_URL = "http://localhost:3000"
SCREENSHOT_DIR = "e:/DrawWork/test-screenshots"

# 生成唯一测试用户
TEST_USER = {
    "username": f"testuser_{uuid.uuid4().hex[:8]}",
    "email": f"test_{uuid.uuid4().hex[:8]}@example.com",
    "password": "Test123456!"
}

def take_screenshot(page, name):
    """截图并保存"""
    import os
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    path = f"{SCREENSHOT_DIR}/{name}.png"
    page.screenshot(path=path, full_page=True)
    print(f"Screenshot saved: {path}")
    return path

def test_drawwork():
    with sync_playwright() as p:
        # 启动浏览器（有界面模式）
        browser = p.chromium.launch(headless=False, slow_mo=200)
        context = browser.new_context(viewport={"width": 1400, "height": 900})
        page = context.new_page()

        try:
            print("=== Step 1: 访问首页 ===")
            page.goto(f"{BASE_URL}/")
            page.wait_for_load_state('networkidle')
            take_screenshot(page, "01_homepage")

            print("=== Step 2: 进入注册页面 ===")
            page.goto(f"{BASE_URL}/register")
            page.wait_for_load_state('networkidle')
            take_screenshot(page, "02_register_page")

            print("=== Step 3: 填写注册信息 ===")
            # 填写表单
            page.fill('input[name="username"]', TEST_USER["username"])
            page.fill('input[name="email"]', TEST_USER["email"])
            page.fill('input[name="password"]', TEST_USER["password"])
            take_screenshot(page, "03_register_filled")

            print("=== Step 4: 提交注册 ===")
            submit_btn = page.locator('button[type="submit"]').first
            submit_btn.click()
            page.wait_for_load_state('networkidle')
            page.wait_for_timeout(2000)
            take_screenshot(page, "04_after_register")

            print("=== Step 5: 创建画板 ===")
            # 等待跳转到仪表盘
            page.wait_for_timeout(2000)

            # 查找创建画板按钮
            create_board_btn = page.locator('button:has-text("新建画板")').first
            create_board_btn.click()
            page.wait_for_timeout(1000)
            take_screenshot(page, "05_create_board_dialog")

            # 填写画板名称
            board_name = f"Test Board {uuid.uuid4().hex[:6]}"
            page.fill('input[name="name"]', board_name)
            take_screenshot(page, "06_board_name_filled")

            # 提交
            page.click('button:has-text("创建")')
            page.wait_for_timeout(2000)
            take_screenshot(page, "07_board_created")

            print("=== Step 6: 进入画板内部 ===")
            # 点击画板卡片进入详情页
            board_card = page.locator(f'.board-card:has-text("{board_name}")').first
            board_card.click()
            page.wait_for_timeout(2000)
            take_screenshot(page, "08_board_detail")

            print("=== Step 7: 创建画布/白板 ===")
            # 查找创建画布按钮
            create_canvas_btn = page.locator('button:has-text("新增画布"), button:has-text("创建画布")').first
            create_canvas_btn.click()
            page.wait_for_timeout(1000)
            take_screenshot(page, "09_create_canvas_dialog")

            # 填写画布名称
            canvas_name = f"Test Canvas {uuid.uuid4().hex[:6]}"
            page.fill('input[name="name"]', canvas_name)
            take_screenshot(page, "10_canvas_name_filled")

            # 提交创建画布
            page.click('button:has-text("创建")')
            page.wait_for_timeout(3000)
            take_screenshot(page, "11_canvas_created")

            print("=== Step 8: 绘制图形（Excalidraw 编辑器）===")
            # 等待编辑器加载
            page.wait_for_timeout(3000)

            # 检查是否有工具栏（Excalidraw 的特征）
            toolbar = page.locator('.excalidraw, [class*="excalidraw"], canvas, .App-menu, .Island').first
            if toolbar.is_visible():
                take_screenshot(page, "12_editor_loaded")

                # 尝试选择矩形工具（工具栏按钮）
                tools = page.locator('.App-toolbar, .toolbar, .ToolButton').all()
                if len(tools) > 0:
                    # 点击工具栏第二个按钮（通常是矩形）
                    tools[1].click()
                    page.wait_for_timeout(500)
                    take_screenshot(page, "13_rect_tool_selected")

                # 在画布上绘制矩形
                canvas = page.locator('canvas').first
                if canvas.is_visible():
                    box = canvas.bounding_box()
                    if box:
                        center_x = box['x'] + box['width'] / 2
                        center_y = box['y'] + box['height'] / 2
                        page.mouse.move(center_x - 100, center_y - 50)
                        page.mouse.down()
                        page.mouse.move(center_x + 100, center_y + 50)
                        page.mouse.up()
                        page.wait_for_timeout(1000)
                        take_screenshot(page, "14_drew_rectangle")

            print("\n=== E2E 测试成功完成！===")
            print(f"截图保存位置: {SCREENSHOT_DIR}/")
            print(f"测试用户: {TEST_USER}")

        except Exception as e:
            print(f"Test failed: {e}")
            take_screenshot(page, "error_state")
            raise

        finally:
            browser.close()

if __name__ == "__main__":
    test_drawwork()
