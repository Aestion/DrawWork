"""
Coord Manager — 窗口定位 + 相对坐标计算
核心目标: 消除硬编码屏幕坐标，所有操作基于窗口内相对偏移
"""
import time
import os
from typing import Tuple

try:
    import pygetwindow as gw
except ImportError:
    raise ImportError("pygetwindow not installed. Run: pip install PyGetWindow")

# 操作模式: 0=禁用 (headless), 1=真实移动鼠标
HEADLESS = os.environ.get("HEADLESS", "1") != "0"


class CoordManager:
    """
    基于窗口标题定位 Chrome 窗口位置，
    所有操作坐标均转换为"窗口内相对像素 + 窗口左上角屏幕偏移"。

    用法:
        cm = CoordManager()
        cm.locate_window()
        x, y = cm.canvas_center   # 画布中心的屏幕绝对坐标
        pyautogui.moveTo(x, y, duration=0.5)
        pyautogui.click()
    """

    # 窗口标题匹配关键字（按优先级）
    TITLE_PATTERNS = [
        "localhost:5173",      # Vite dev server
        "DrawWork",            # Tab title
        "Vite",                # Vite default tab
        "localhost",           # Generic localhost
        "Chrome",              # Fallback: any Chrome window
    ]

    # 默认布局比例（窗口内相对位置）
    # 这些值基于 DrawWork 典型布局，可微调
    LAYOUT = {
        "login_box_y_ratio": 0.55,       # 登录框在页面高度 55% 处
        "login_box_x_center": 0.50,      # 水平居中
        "email_input_y_ratio": 0.45,     # email 输入框相对登录框
        "password_input_y_ratio": 0.52,  # password 输入框
        "submit_btn_y_ratio": 0.60,      # 提交按钮
        "sidebar_width_ratio": 0.08,     # 左侧边栏宽度比例
        "toolbar_x_ratio": 0.03,         # 工具栏 x 位置
        "toolbar_first_btn_y_ratio": 0.15,  # 第一个工具按钮 y
        "toolbar_btn_spacing": 36,       # 工具栏按钮间距 (px)
        "canvas_left_ratio": 0.08,       # 画布区域左边界
        "canvas_top_ratio": 0.08,        # 画布区域上边界
        "canvas_right_padding": 40,      # 画布右边距 (px)
        "canvas_bottom_padding": 60,     # 画布下边距 (px)
    }

    def __init__(self, headless: bool | None = None):
        self._headless = HEADLESS if headless is None else headless
        self._window = None
        self._offset_x = 0
        self._offset_y = 0
        self._window_width = 1920
        self._window_height = 1080

    # ─── window location ────────────────────────────────────

    def locate_window(self, retries: int = 15, interval: float = 1.0) -> bool:
        """
        尝试定位浏览器窗口，重试最多 retries 次。

        返回 True 表示找到并激活了窗口。
        """
        for attempt in range(retries):
            all_windows = gw.getAllWindows()
            for pattern in self.TITLE_PATTERNS:
                for win in all_windows:
                    title = win.title.lower()
                    if pattern.lower() in title:
                        self._window = win
                        self._activate_window()
                        self._capture_dimensions()
                        print(f"  ✓ Window found: '{win.title}' "
                              f"({self._window_width}x{self._window_height} "
                              f"at {self._offset_x},{self._offset_y})")
                        return True

            if attempt < retries - 1:
                time.sleep(interval)

        print(f"  ⚠️  Could not locate target window after {retries} attempts.")
        return False

    def _activate_window(self):
        """Activate and maximize the target window."""
        if self._window is None:
            return
        try:
            if self._window.isMinimized:
                self._window.restore()
            self._window.activate()
            time.sleep(0.5)
            self._window.maximize()
            time.sleep(0.3)
        except Exception as e:
            print(f"  ⚠️  Window activate error: {e}")

    def _capture_dimensions(self):
        """Record window position and size after activation."""
        if self._window is None:
            return
        # Re-fetch after activation (coordinates may have changed)
        try:
            self._window = gw.getWindowsWithTitle(self._window.title)[0]
        except IndexError:
            pass

        self._offset_x = self._window.left
        self._offset_y = self._window.top
        self._window_width = self._window.width
        self._window_height = self._window.height

    # ─── coordinate conversion ──────────────────────────────

    def screen_xy(self, rel_x: int, rel_y: int) -> Tuple[int, int]:
        """窗口内相对坐标 → 屏幕绝对坐标"""
        return (self._offset_x + rel_x, self._offset_y + rel_y)

    def rel_x(self, ratio: float) -> int:
        """给定水平比例 (0.0~1.0) → 窗口内 x 像素"""
        return int(self._window_width * ratio)

    def rel_y(self, ratio: float) -> int:
        """给定垂直比例 (0.0~1.0) → 窗口内 y 像素"""
        return int(self._window_height * ratio)

    # ─── layout presets (窗口内坐标) ────────────────────────

    @property
    def canvas_center(self) -> Tuple[int, int]:
        """画布区域中心（窗口内坐标）"""
        cx = self._window_width * (1 + self.LAYOUT["canvas_left_ratio"]) / 2
        cy = self._window_height * 0.50
        return (int(cx), int(cy))

    @property
    def canvas_top_left(self) -> Tuple[int, int]:
        """画布区域左上角（窗口内坐标）"""
        return (self.rel_x(self.LAYOUT["canvas_left_ratio"]),
                self.rel_y(self.LAYOUT["canvas_top_ratio"]))

    def toolbar_button(self, index: int = 0) -> Tuple[int, int]:
        """左侧工具栏第 N 个按钮的窗口内坐标"""
        x = self.rel_x(self.LAYOUT["toolbar_x_ratio"])
        y = self.rel_y(self.LAYOUT["toolbar_first_btn_y_ratio"]) + index * self.LAYOUT["toolbar_btn_spacing"]
        return (int(x), int(y))

    @property
    def login_email_field(self) -> Tuple[int, int]:
        """登录页 email 输入框的窗口内坐标"""
        cx = self.rel_x(self.LAYOUT["login_box_x_center"])
        cy = self.rel_y(self.LAYOUT["email_input_y_ratio"])
        return (int(cx), int(cy))

    @property
    def login_password_field(self) -> Tuple[int, int]:
        """登录页 password 输入框的窗口内坐标"""
        cx = self.rel_x(self.LAYOUT["login_box_x_center"])
        cy = self.rel_y(self.LAYOUT["password_input_y_ratio"])
        return (int(cx), int(cy))

    @property
    def login_submit_button(self) -> Tuple[int, int]:
        """登录页提交按钮的窗口内坐标"""
        cx = self.rel_x(self.LAYOUT["login_box_x_center"])
        cy = self.rel_y(self.LAYOUT["submit_btn_y_ratio"])
        return (int(cx), int(cy))

    def sidebar_tab(self, tab_index: int = 0) -> Tuple[int, int]:
        """右侧边栏第 N 个标签的窗口内坐标"""
        x = self._window_width - 60
        y = self.rel_y(0.15) + tab_index * 40
        return (int(x), int(y))

    # ─── properties ─────────────────────────────────────────

    @property
    def is_ready(self) -> bool:
        return self._window is not None

    @property
    def window_size(self) -> Tuple[int, int]:
        return (self._window_width, self._window_height)

    @property
    def offset(self) -> Tuple[int, int]:
        """窗口左上角在屏幕上的绝对位置"""
        return (self._offset_x, self._offset_y)


# ─── quick test ─────────────────────────────────────────────
if __name__ == "__main__":
    cm = CoordManager()
    if cm.locate_window():
        print(f"\nWindow: {cm.window_size}")
        print(f"Offset: {cm.offset}")
        print(f"Canvas center (window): {cm.canvas_center}")
        print(f"Canvas center (screen):  {cm.screen_xy(*cm.canvas_center)}")
        print(f"Toolbar btn 0 (screen):  {cm.screen_xy(*cm.toolbar_button(0))}")
    else:
        print("No window found.")
