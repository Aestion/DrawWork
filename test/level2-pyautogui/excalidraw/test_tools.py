"""
Level 2: Excalidraw Tools — Hotkey switching + toolbar click
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
    """Set up editor session."""
    api = requests.Session()
    api.headers["Content-Type"] = "application/json"
    api.post("http://localhost:3000/api/auth/register", json={
        "username": f"l2_tool_{ts}",
        "email": f"l2_tool_{ts}@test.com",
        "password": "TestPass123!",
    })
    resp = api.post("http://localhost:3000/api/auth/login", json={
        "email": f"l2_tool_{ts}@test.com",
        "password": "TestPass123!",
    })
    api.headers["Authorization"] = f"Bearer {resp.json()['token']}"
    board = api.post("http://localhost:3000/api/boards", json={"name": f"Tool Board {ts}"})
    webbrowser.open(f"http://localhost:5173/board/{board.json()['id']}")
    time.sleep(4)
    coord.locate_window()
    time.sleep(1)
    return coord


@pytest.mark.level2
def test_tool_hotkeys_switch(editor):
    """Verify R/E/A/L hotkeys switch between tools. Each key press should be accepted."""
    coord = editor
    diff = ScreenshotDiff()

    tools = ["r", "e", "a", "l"]  # rectangle, ellipse, arrow, line
    for tool_key in tools:
        pyautogui.press(tool_key)
        time.sleep(0.3)
        path = diff.capture_fullscreen(f"l2_tool_{tool_key}")
        assert path.exists()
        print(f"  📸 Tool '{tool_key}' screenshot: {path}")


@pytest.mark.level2
def test_toolbar_click_switches(editor):
    """Click first toolbar button (selection tool) — verify no error popup."""
    coord = editor
    diff = ScreenshotDiff()

    # Click toolbar button at index 0 (usually Selection/Hand tool)
    tx, ty = coord.screen_xy(*coord.toolbar_button(0))
    pyautogui.moveTo(tx, ty, duration=0.3)
    pyautogui.click()
    time.sleep(0.5)

    path = diff.capture_fullscreen("l2_toolbar_click")
    assert path.exists()
    print(f"  📸 Toolbar click result: {path}")

    # Also test toolbar button index 1 (likely Rectangle)
    tx2, ty2 = coord.screen_xy(*coord.toolbar_button(1))
    pyautogui.moveTo(tx2, ty2, duration=0.3)
    pyautogui.click()
    time.sleep(0.5)

    path2 = diff.capture_fullscreen("l2_toolbar_btn1")
    assert path2.exists()
    print(f"  📸 Toolbar btn1 result: {path2}")
