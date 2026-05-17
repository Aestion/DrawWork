#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
真实用户行为模拟 - PyAutoGUI 操作 DrawWork 应用
你会看到真实的鼠标移动和点击！
"""

import subprocess
import time
import webbrowser
import sys

try:
    import pyautogui
    import pygetwindow as gw
except ImportError:
    print("正在安装依赖...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pyautogui", "pygetwindow"])
    import pyautogui
    import pygetwindow as gw

# 配置
pyautogui.FAILSAFE = True  # 鼠标移到左上角退出
pyautogui.PAUSE = 0.5  # 操作间隔

FRONTEND_URL = "http://localhost:5173"
SCREEN_WIDTH, SCREEN_HEIGHT = pyautogui.size()
print(f"屏幕分辨率: {SCREEN_WIDTH}x{SCREEN_HEIGHT}")


def start_services():
    """启动 DrawWork 前后端服务"""
    print("\n🚀 启动服务...")

    # 启动后端
    print("  → 启动后端 (localhost:3000)...")
    backend = subprocess.Popen(
        ["cmd", "/c", "cd /d e:\\DrawWork\\backend && set DATABASE_URL=sqlite:./dev.db && set NODE_ENV=development && set PORT=3000 && set REDIS_URL=redis://localhost:6379 && node src/app.js"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        creationflags=subprocess.CREATE_NEW_CONSOLE
    )

    # 等待后端启动
    time.sleep(3)

    # 启动 Yjs 协作服务器
    print("  → 启动 Yjs 服务器 (localhost:3001)...")
    yjs = subprocess.Popen(
        ["cmd", "/c", "cd /d e:\\DrawWork\\yjs-server && set SQLITE_PATH=../backend/dev.db && set API_URL=http://localhost:3000 && node src/server.js"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        creationflags=subprocess.CREATE_NEW_CONSOLE
    )

    time.sleep(2)

    # 启动前端
    print("  → 启动前端 (localhost:5173)...")
    frontend = subprocess.Popen(
        ["cmd", "/c", "cd /d e:\\DrawWork\\frontend && npx vite --port 5173"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        creationflags=subprocess.CREATE_NEW_CONSOLE
    )

    time.sleep(5)  # 等待 Vite 启动
    print("✅ 服务启动完成\n")

    return backend, yjs, frontend


def open_browser():
    """打开 Chrome 浏览器"""
    print("🌐 打开 Chrome 浏览器...")

    # 使用 Chrome 打开 DrawWork
    chrome_path = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    subprocess.Popen([
        chrome_path,
        "--new-window",
        "--window-size=1400,900",
        FRONTEND_URL
    ])

    time.sleep(3)


def find_browser_window():
    """找到浏览器窗口并激活"""
    print("🔍 查找浏览器窗口...")

    for attempt in range(10):
        try:
            # 查找包含 localhost:5173 或 DrawWork 的窗口
            windows = gw.getAllWindows()
            for win in windows:
                title = win.title.lower()
                if 'localhost' in title or '5173' in title or 'vite' in title or 'drawwork' in title:
                    print(f"  ✓ 找到窗口: {win.title}")
                    win.activate()
                    win.maximize()
                    time.sleep(1)
                    return True
        except Exception as e:
            print(f"  尝试 {attempt + 1}: {e}")

        time.sleep(1)

    print("⚠️ 未找到特定窗口，尝试激活 Chrome...")
    try:
        chrome = gw.getWindowsWithTitle('Chrome')[0]
        chrome.activate()
        chrome.maximize()
        return True
    except:
        pass

    return False


def simulate_real_user_actions():
    """模拟真实用户操作 - 你会看到鼠标移动！"""
    print("\n👤 开始模拟真实用户操作...")
    print("⚠️ 注意：不要动鼠标，或者按 ESC 停止\n")

    time.sleep(2)

    # 1. 等待页面加载
    print("1️⃣ 等待页面加载...")
    time.sleep(3)

    # 2. 移动鼠标到屏幕中央（登录按钮区域）
    center_x, center_y = SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2
    print(f"2️⃣ 移动鼠标到屏幕中央 ({center_x}, {center_y})...")
    pyautogui.moveTo(center_x, center_y, duration=1.5)  # 你会看到鼠标慢慢移动！

    # 3. 尝试点击登录区域
    print("3️⃣ 点击登录区域...")
    pyautogui.click()
    time.sleep(1)

    # 4. 如果看到输入框，输入测试账号
    print("4️⃣ 尝试输入账号...")
    pyautogui.typewrite("test1@example.com", interval=0.1)  # 像真人一样打字
    time.sleep(0.5)

    # 5. 按 Tab 切换到密码
    pyautogui.keyDown('tab')
    pyautogui.keyUp('tab')
    time.sleep(0.5)

    print("5️⃣ 输入密码...")
    pyautogui.typewrite("password123", interval=0.1)
    time.sleep(0.5)

    # 6. 按回车登录
    print("6️⃣ 点击登录...")
    pyautogui.keyDown('return')
    pyautogui.keyUp('return')
    time.sleep(3)

    # 7. 移动鼠标到画板区域（右侧）
    print("7️⃣ 移动鼠标到画板区域...")
    board_x, board_y = center_x + 200, center_y - 100
    pyautogui.moveTo(board_x, board_y, duration=1)

    # 8. 模拟画图 - 拖动创建形状
    print("8️⃣ 在画板上画图...")
    pyautogui.mouseDown()
    pyautogui.moveRel(200, 150, duration=1)
    pyautogui.mouseUp()
    time.sleep(1)

    # 9. 双击打开
    print("9️⃣ 双击打开画板...")
    pyautogui.doubleClick()
    time.sleep(2)

    # 10. 在画板内画一个矩形
    print("🔟 在画板内绘制矩形...")
    draw_x, draw_y = center_x - 100, center_y - 100
    pyautogui.moveTo(draw_x, draw_y, duration=0.8)
    pyautogui.mouseDown()
    pyautogui.moveRel(300, 200, duration=1.5)
    pyautogui.mouseUp()

    print("\n✅ 真实用户操作完成！")


def take_screenshot(filename="screenshot.png"):
    """截图保存"""
    screenshot = pyautogui.screenshot()
    screenshot.save(filename)
    print(f"📸 截图已保存: {filename}")


def main():
    """主流程"""
    print("=" * 50)
    print("🎮 DrawWork 真实用户行为模拟器")
    print("=" * 50)
    print("\n⚠️ 提示：")
    print("  - 你会看到真实的鼠标移动和点击")
    print("  - 如果想停止，快速移动鼠标到屏幕左上角")
    print("  - 请勿在运行过程中操作鼠标/键盘")
    print("\n")

    try:
        # 启动服务
        backend, yjs, frontend = start_services()

        # 打开浏览器
        open_browser()

        # 找到并激活浏览器窗口
        if find_browser_window():
            # 执行真实用户操作
            simulate_real_user_actions()

            # 截图
            take_screenshot("drawwork_automation.png")
        else:
            print("❌ 未找到浏览器窗口，请手动切换到 Chrome")

        print("\n✨ 自动化完成！浏览器保持打开状态")
        print("   按 Ctrl+C 结束脚本并关闭服务")

        # 保持运行
        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print("\n\n🛑 用户停止脚本")
    except Exception as e:
        print(f"\n❌ 错误: {e}")
    finally:
        # 清理
        try:
            backend.terminate()
            yjs.terminate()
            frontend.terminate()
        except:
            pass
        print("✅ 已清理服务")


if __name__ == "__main__":
    main()
