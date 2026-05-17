"""
Level 2: Excalidraw Text Tool — English + Chinese input
"""
import pytest
import time
import pyautogui
import webbrowser
import requests

from shared.coord_manager import CoordManager
from shared.screenshot_diff import ScreenshotDiff

ts = int(time.time())


@pytest.fixture
def editor(coord, services):
    api = requests.Session()
    api.headers["Content-Type"] = "application/json"
    api.post("http://localhost:3000/api/auth/register", json={
        "username": f"l2_txt_{ts}",
        "email": f"l2_txt_{ts}@test.com",
        "password": "TestPass123!",
    })
    resp = api.post("http://localhost:3000/api/auth/login", json={
        "email": f"l2_txt_{ts}@test.com",
        "password": "TestPass123!",
    })
    api.headers["Authorization"] = f"Bearer {resp.json()['token']}"
    board = api.post("http://localhost:3000/api/boards", json={"name": f"Text Board {ts}"})
    webbrowser.open(f"http://localhost:5173/board/{board.json()['id']}")
    time.sleep(4)
    coord.locate_window()
    time.sleep(1)
    return coord


@pytest.mark.level2
def test_text_english_input(editor):
    """Create text element with English input. Verify canvas changes."""
    coord = editor
    diff = ScreenshotDiff()

    before = diff.capture_fullscreen("l2_text_en_before")

    # Select text tool — in Excalidraw it's typically 'T'
    pyautogui.press("t")
    time.sleep(0.3)

    # Click canvas to create text box
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.click(cx, cy)
    time.sleep(0.3)

    # Type English text
    pyautogui.write("Hello DrawWork!", interval=0.05)
    time.sleep(0.5)

    # Click outside to confirm
    pyautogui.click(cx + 100, cy + 50)
    time.sleep(0.5)

    after = diff.capture_fullscreen("l2_text_en_after")

    from PIL import Image, ImageChops
    diff_data = ImageChops.difference(Image.open(before), Image.open(after)).getdata()
    changed = sum(1 for px in diff_data if px != (0, 0, 0))
    print(f"  Text draw change: {changed / (len(diff_data) * 3):.2%}")
    assert changed / (len(diff_data) * 3) > 0.0005, "Canvas should change after adding text"


@pytest.mark.level2
def test_text_chinese_input(editor):
    """Create text element with Chinese characters. Verify canvas changes."""
    coord = editor
    diff = ScreenshotDiff()

    before = diff.capture_fullscreen("l2_text_zh_before")

    pyautogui.press("t")
    time.sleep(0.3)

    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.click(cx + 50, cy + 20)  # offset from English test to avoid overlap
    time.sleep(0.3)

    # Chinese input — note: pyautogui.write() uses keyboard layout, may not work with IME
    # Instead, use clipboard paste approach
    import subprocess
    chinese_text = "画布测试"
    subprocess.run("clip", input=chinese_text.encode("utf-16-le"), shell=True)
    time.sleep(0.1)
    pyautogui.hotkey("ctrl", "v")
    time.sleep(0.5)

    pyautogui.click(cx + 150, cy + 70)
    time.sleep(0.5)

    after = diff.capture_fullscreen("l2_text_zh_after")

    from PIL import Image, ImageChops
    diff_data = ImageChops.difference(Image.open(before), Image.open(after)).getdata()
    changed = sum(1 for px in diff_data if px != (0, 0, 0))
    print(f"  Chinese text change: {changed / (len(diff_data) * 3):.2%}")
    assert changed / (len(diff_data) * 3) > 0.0005, "Canvas should change after Chinese text"
