"""
Level 2: Excalidraw Manipulation — Move, Resize, Rotate elements
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
        "username": f"l2_manip_{ts}",
        "email": f"l2_manip_{ts}@test.com",
        "password": "TestPass123!",
    })
    resp = api.post("http://localhost:3000/api/auth/login", json={
        "email": f"l2_manip_{ts}@test.com",
        "password": "TestPass123!",
    })
    api.headers["Authorization"] = f"Bearer {resp.json()['token']}"
    board = api.post("http://localhost:3000/api/boards", json={"name": f"Manip Board {ts}"})
    webbrowser.open(f"http://localhost:5173/board/{board.json()['id']}")
    time.sleep(4)
    coord.locate_window()
    time.sleep(1)
    return coord


def _draw_rect(coord, offset=(0, 0)):
    """Draw a rectangle at offset from canvas center."""
    pyautogui.press("r")
    time.sleep(0.3)
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.moveTo(cx - 80 + offset[0], cy - 60 + offset[1], duration=0.2)
    pyautogui.mouseDown()
    pyautogui.moveRel(160, 120, duration=0.3)
    pyautogui.mouseUp()
    time.sleep(0.5)


@pytest.mark.level2
def test_move_element(editor):
    """Select rectangle and drag to move it. Verify position changed."""
    coord = editor
    diff = ScreenshotDiff()

    _draw_rect(coord)
    before = diff.capture_fullscreen("l2_move_before")

    # Select tool (press V for selection)
    pyautogui.press("v")
    time.sleep(0.3)

    # Click on the rectangle to select it 
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.click(cx, cy)
    time.sleep(0.3)

    # Drag to move
    pyautogui.mouseDown()
    pyautogui.moveRel(100, 50, duration=0.4)
    pyautogui.mouseUp()
    time.sleep(0.5)

    after = diff.capture_fullscreen("l2_move_after")

    from PIL import Image, ImageChops
    diff_data = ImageChops.difference(Image.open(before), Image.open(after)).getdata()
    changed = sum(1 for px in diff_data if px != (0, 0, 0))
    print(f"  Move change: {changed / (len(diff_data) * 3):.2%}")
    # After moving, pixels should shift
    assert changed / (len(diff_data) * 3) > 0.0001


@pytest.mark.level2
def test_multi_select_and_move(editor):
    """Draw two rectangles, select both, move together."""
    coord = editor
    diff = ScreenshotDiff()

    _draw_rect(coord, offset=(-100, -50))
    _draw_rect(coord, offset=(100, 50))
    before = diff.capture_fullscreen("l2_multiselect_before")

    # Select all
    pyautogui.hotkey("ctrl", "a")
    time.sleep(0.3)

    # Drag to move both
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.moveTo(cx, cy, duration=0.2)
    pyautogui.mouseDown()
    pyautogui.moveRel(80, 40, duration=0.4)
    pyautogui.mouseUp()
    time.sleep(0.5)

    after = diff.capture_fullscreen("l2_multiselect_after")

    from PIL import Image, ImageChops
    diff_data = ImageChops.difference(Image.open(before), Image.open(after)).getdata()
    changed = sum(1 for px in diff_data if px != (0, 0, 0))
    print(f"  Multi-select move change: {changed / (len(diff_data) * 3):.2%}")
    assert changed / (len(diff_data) * 3) > 0.0001
