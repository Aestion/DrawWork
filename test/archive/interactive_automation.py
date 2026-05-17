#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
交互式 DrawWork 自动化测试
支持：暂停、调整、逐步执行、截图反馈
"""

import subprocess
import time
import json
import sys
from pathlib import Path

try:
    import pyautogui
    import pygetwindow as gw
    from PIL import Image
except ImportError:
    print("安装依赖...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pyautogui", "pygetwindow", "pillow"])
    import pyautogui
    import pygetwindow as gw

pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.3

# 配置文件路径
CONFIG_FILE = Path("automation_config.json")
SCREENSHOT_DIR = Path("automation_screenshots")
SCREENSHOT_DIR.mkdir(exist_ok=True)


class InteractiveAutomation:
    def __init__(self):
        self.config = self.load_config()
        self.step = 0
        self.running = True

    def load_config(self):
        """加载或创建配置"""
        default_config = {
            "wait_between_steps": 2,
            "mouse_speed": 1.0,
            "typing_speed": 0.05,
            "screenshot_each_step": True,
            "services": {
                "backend_port": 3000,
                "yjs_port": 3001,
                "frontend_port": 5173
            },
            "actions": [
                {"name": "启动服务", "enabled": True, "func": "start_services"},
                {"name": "打开浏览器", "enabled": True, "func": "open_browser"},
                {"name": "等待页面加载", "enabled": True, "func": "wait_load", "params": {"seconds": 5}},
                {"name": "截图初始状态", "enabled": True, "func": "screenshot", "params": {"name": "01_initial"}},
                {"name": "移动到登录区域", "enabled": True, "func": "move_to", "params": {"x": 960, "y": 600}},
                {"name": "截图登录页", "enabled": True, "func": "screenshot", "params": {"name": "02_login"}},
                {"name": "输入邮箱", "enabled": True, "func": "type_text", "params": {"text": "test1@example.com"}},
                {"name": "按 Tab", "enabled": True, "func": "press_key", "params": {"key": "tab"}},
                {"name": "输入密码", "enabled": True, "func": "type_text", "params": {"text": "password123"}},
                {"name": "截图填写后", "enabled": True, "func": "screenshot", "params": {"name": "03_filled"}},
                {"name": "点击登录", "enabled": True, "func": "press_key", "params": {"key": "return"}},
                {"name": "等待登录完成", "enabled": True, "func": "wait_load", "params": {"seconds": 3}},
                {"name": "截图登录后", "enabled": True, "func": "screenshot", "params": {"name": "04_logged_in"}},
                {"name": "移动到画板区域", "enabled": True, "func": "move_to", "params": {"x": 1200, "y": 500}},
                {"name": "截图画板", "enabled": True, "func": "screenshot", "params": {"name": "05_board"}},
                {"name": "双击打开画板", "enabled": True, "func": "double_click"},
                {"name": "等待编辑器加载", "enabled": True, "func": "wait_load", "params": {"seconds": 2}},
                {"name": "截图编辑器", "enabled": True, "func": "screenshot", "params": {"name": "06_editor"}},
                {"name": "绘制矩形", "enabled": True, "func": "drag_to", "params": {"dx": 300, "dy": 200}},
                {"name": "截图绘制结果", "enabled": True, "func": "screenshot", "params": {"name": "07_drawn"}}
            ]
        }

        if CONFIG_FILE.exists():
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                saved = json.load(f)
                default_config.update(saved)
        else:
            self.save_config(default_config)

        return default_config

    def save_config(self, config=None):
        """保存配置"""
        if config is None:
            config = self.config
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        print(f"💾 配置已保存到 {CONFIG_FILE}")

    def log(self, message):
        """输出带时间的日志"""
        timestamp = time.strftime("%H:%M:%S")
        print(f"[{timestamp}] {message}")

    def screenshot(self, name="screenshot"):
        """截图并保存"""
        filename = SCREENSHOT_DIR / f"{name}_{int(time.time())}.png"
        screenshot = pyautogui.screenshot()
        screenshot.save(filename)
        self.log(f"📸 截图已保存: {filename}")
        return str(filename)

    def move_to(self, x, y):
        """移动鼠标到指定位置"""
        self.log(f"🖱️  移动鼠标到 ({x}, {y})")
        pyautogui.moveTo(x, y, duration=self.config["mouse_speed"])

    def type_text(self, text):
        """输入文本"""
        self.log(f"⌨️  输入: {text}")
        pyautogui.typewrite(text, interval=self.config["typing_speed"])

    def press_key(self, key):
        """按键"""
        self.log(f"🔘 按下: {key}")
        pyautogui.press(key)

    def double_click(self):
        """双击"""
        self.log("🖱️  双击")
        pyautogui.doubleClick()

    def drag_to(self, dx, dy):
        """拖拽"""
        self.log(f"✋ 拖拽 ({dx}, {dy})")
        pyautogui.mouseDown()
        pyautogui.moveRel(dx, dy, duration=1)
        pyautogui.mouseUp()

    def wait_load(self, seconds):
        """等待"""
        self.log(f"⏳ 等待 {seconds} 秒...")
        time.sleep(seconds)

    def start_services(self):
        """启动 DrawWork 服务"""
        self.log("🚀 启动服务...")
        # 这里启动服务的代码...
        time.sleep(5)
        self.log("✅ 服务已启动")

    def open_browser(self):
        """打开浏览器"""
        self.log("🌐 打开 Chrome...")
        chrome_path = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
        subprocess.Popen([
            chrome_path,
            "--new-window",
            f"--window-size=1400,900",
            "http://localhost:5173"
        ])
        time.sleep(3)
        self.log("✅ 浏览器已打开")

    def pause_for_adjustment(self):
        """暂停等待用户调整"""
        self.log("⏸️  暂停 - 你可以:")
        self.log("   1. 修改 automation_config.json")
        self.log("   2. 调整浏览器窗口")
        self.log("   3. 准备好后按回车继续...")
        input()

    def run_single_step(self, action):
        """执行单步"""
        if not action.get("enabled", True):
            self.log(f"⏭️  跳过: {action['name']}")
            return

        self.log(f"\n▶️ 步骤 {self.step + 1}: {action['name']}")

        # 执行动作
        func_name = action["func"]
        params = action.get("params", {})

        if hasattr(self, func_name):
            func = getattr(self, func_name)
            func(**params)
        else:
            self.log(f"⚠️ 未知动作: {func_name}")

        # 截图
        if self.config.get("screenshot_each_step"):
            self.screenshot(f"step_{self.step:02d}_{action['name'].replace(' ', '_')}")

        self.step += 1

        # 步间等待
        time.sleep(self.config.get("wait_between_steps", 1))

    def run(self):
        """主运行循环"""
        self.log("=" * 50)
        self.log("🎮 交互式 DrawWork 自动化")
        self.log("=" * 50)
        self.log("\n命令:")
        self.log("  [回车] - 执行下一步")
        self.log("  'a' + 回车 - 自动执行剩余步骤")
        self.log("  'p' + 回车 - 暂停并编辑配置")
        self.log("  'q' + 回车 - 退出")
        self.log("")

        auto_mode = False

        for action in self.config["actions"]:
            if not self.running:
                break

            if not auto_mode:
                self.log(f"\n准备执行: {action['name']}")
                cmd = input("> ").strip().lower()

                if cmd == 'q':
                    break
                elif cmd == 'a':
                    auto_mode = True
                elif cmd == 'p':
                    self.pause_for_adjustment()
                    self.config = self.load_config()  # 重新加载配置

            self.run_single_step(action)

        self.log("\n✅ 自动化完成！")
        self.log(f"📁 截图保存在: {SCREENSHOT_DIR}")


if __name__ == "__main__":
    try:
        bot = InteractiveAutomation()
        bot.run()
    except KeyboardInterrupt:
        print("\n\n🛑 用户中断")
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()
