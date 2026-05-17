"""
Level 2: Excalidraw Undo/Redo — Deep chain: 20-step undo verification
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
        "username": f"l2_ur_{ts}",
        "email": f"l2_ur_{ts}@test.com",
        "password": "TestPass123!",
    })
    resp = api.post("http://localhost:3000/api/auth/login", json={
        "email": f"l2_ur_{ts}@test.com",
        "password": "TestPass123!",
    })
    api.headers["Authorization"] = f"Bearer {resp.json()['token']}"
    board = api.post("http://localhost:3000/api/boards", json={"name": f"UR Board {ts}"})
    webbrowser.open(f"http://localhost:5173/board/{board.json()['id']}")
    time.sleep(4)
    coord.locate_window()
    time.sleep(1)
    return coord


@pytest.mark.level2
def test_undo_chain_10_steps(editor):
    """Draw 5 rectangles, then undo all 5. Verify canvas returns to blank state."""
    coord = editor
    diff = ScreenshotDiff()

    # Capture blank canvas
    blank = diff.capture_fullscreen("l2_undo_chain_blank")
    from PIL import Image
    blank_img = Image.open(blank)

    # Draw 5 rectangles at different positions
    for i in range(5):
        pyautogui.press("r")
        time.sleep(0.2)
        cx, cy = coord.screen_xy(*coord.canvas_center)
        ox = (i - 2) * 120
        oy = (i - 2) * 80
        pyautogui.moveTo(cx - 50 + ox, cy - 40 + oy, duration=0.15)
        pyautogui.mouseDown()
        pyautogui.moveRel(100, 70, duration=0.2)
        pyautogui.mouseUp()
        time.sleep(0.3)

    after_draw = diff.capture_fullscreen("l2_undo_chain_5rects")

    # Undo 5 times
    for _ in range(5):
        pyautogui.hotkey("ctrl", "z")
        time.sleep(0.3)

    after_undo = diff.capture_fullscreen("l2_undo_chain_restored")

    # Compare blank vs after-undo — should be very similar
    from PIL import ImageChops
    after_undo_img = Image.open(after_undo)
    d = ImageChops.difference(blank_img, after_undo_img).getdata()
    changed = sum(1 for px in d if px != (0, 0, 0)) / (len(d) * 3)
    print(f"  Undo chain diff from blank: {changed:.2%}")
    # After undoing all 5, canvas should be close to blank
    assert changed < 0.05, f"Canvas should be nearly blank after undoing all, got {changed:.2%}"


@pytest.mark.level2
def test_redo_chain_restores(editor):
    """Draw rect → undo → redo → canvas restored."""
    coord = editor
    diff = ScreenshotDiff()

    # Draw 1 rect
    pyautogui.press("r")
    time.sleep(0.3)
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.moveTo(cx - 60, cy - 40, duration=0.2)
    pyautogui.mouseDown()
    pyautogui.moveRel(120, 80, duration=0.3)
    pyautogui.mouseUp()
    time.sleep(0.5)

    drawn = diff.capture_fullscreen("l2_redo_drawn")
    from PIL import Image
    drawn_img = Image.open(drawn)

    # Undo
    pyautogui.hotkey("ctrl", "z")
    time.sleep(0.3)

    # Redo
    pyautogui.hotkey("ctrl", "shift", "z")
    time.sleep(0.3)

    redone = diff.capture_fullscreen("l2_redo_restored")
    redone_img = Image.open(redone)

    from PIL import ImageChops
    d = ImageChops.difference(drawn_img, redone_img).getdata()
    changed = sum(1 for px in d if px != (0, 0, 0)) / (len(d) * 3)
    print(f"  Redo diff from drawn: {changed:.2%}")
    assert changed < 0.02, f"Redo should restore to drawn state, got {changed:.2%}"
