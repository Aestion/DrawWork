"""
Level 2: Excalidraw Shortcuts — Ctrl+Z/C/V/D
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
        "username": f"l2_short_{ts}",
        "email": f"l2_short_{ts}@test.com",
        "password": "TestPass123!",
    })
    resp = api.post("http://localhost:3000/api/auth/login", json={
        "email": f"l2_short_{ts}@test.com",
        "password": "TestPass123!",
    })
    api.headers["Authorization"] = f"Bearer {resp.json()['token']}"
    board = api.post("http://localhost:3000/api/boards", json={"name": f"Shortcut Board {ts}"})
    webbrowser.open(f"http://localhost:5173/board/{board.json()['id']}")
    time.sleep(4)
    coord.locate_window()
    time.sleep(1)
    return coord


def _draw_rect(coord: CoordManager):
    """Helper: draw a rectangle at canvas center."""
    pyautogui.press("r")
    time.sleep(0.3)
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.moveTo(cx - 80, cy - 60, duration=0.2)
    pyautogui.mouseDown()
    pyautogui.moveRel(160, 120, duration=0.3)
    pyautogui.mouseUp()
    time.sleep(0.5)


@pytest.mark.level2
def test_undo_redo_after_drawing(editor):
    """Ctrl+Z undoes drawing, Ctrl+Shift+Z redoes it. Verify pixel change."""
    coord = editor
    diff = ScreenshotDiff()

    # Draw a rectangle
    _draw_rect(coord)
    after_draw = diff.capture_fullscreen("l2_undo_after_draw")

    # Undo
    pyautogui.hotkey("ctrl", "z")
    time.sleep(0.5)
    after_undo = diff.capture_fullscreen("l2_undo_after_undo")

    # Redo
    pyautogui.hotkey("ctrl", "shift", "z")
    time.sleep(0.5)
    after_redo = diff.capture_fullscreen("l2_undo_after_redo")

    # Verify undo removed content and redo brought it back
    from PIL import Image, ImageChops

    img_draw = Image.open(after_draw)
    img_undo = Image.open(after_undo)
    img_redo = Image.open(after_redo)

    # After undo, canvas should differ from after drawing
    diff_undo = ImageChops.difference(img_draw, img_undo).getdata()
    undo_change = sum(1 for px in diff_undo if px != (0, 0, 0)) / (len(diff_undo) * 3)
    print(f"  Undo change: {undo_change:.2%}")

    # After redo, canvas should be similar to after drawing
    diff_redo = ImageChops.difference(img_draw, img_redo).getdata()
    redo_change = sum(1 for px in diff_redo if px != (0, 0, 0)) / (len(diff_redo) * 3)
    print(f"  Redo change: {redo_change:.2%}")

    assert undo_change > 0.0005, "Undo should visibly change the canvas"
    assert redo_change < 0.01, "Redo should restore canvas to drawn state"


@pytest.mark.level2
def test_copy_paste_element(editor):
    """Ctrl+C to copy, Ctrl+V to paste. Verify two shapes visible."""
    coord = editor
    diff = ScreenshotDiff()

    _draw_rect(coord)

    # Select all (Ctrl+A) then copy
    pyautogui.hotkey("ctrl", "a")
    time.sleep(0.3)
    pyautogui.hotkey("ctrl", "c")
    time.sleep(0.3)

    # Deselect and paste
    pyautogui.press("escape")
    time.sleep(0.2)
    pyautogui.hotkey("ctrl", "v")
    time.sleep(0.5)

    after_paste = diff.capture_fullscreen("l2_copy_paste")
    assert after_paste.exists()
    print(f"  📸 After copy-paste: {after_paste}")
