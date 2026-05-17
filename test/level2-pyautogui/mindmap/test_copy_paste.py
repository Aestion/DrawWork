"""
Level 2: MindMap Copy/Paste — Ctrl+C/V within and across canvases
"""
import pytest
import time
import pyautogui

from shared.screenshot_diff import ScreenshotDiff

ts = int(time.time())


@pytest.fixture
def mindmap_editor(coord, services):
    import webbrowser, requests
    api = requests.Session()
    api.headers["Content-Type"] = "application/json"
    api.post("http://localhost:3000/api/auth/register", json={
        "username": f"l2_mm_cp_{ts}",
        "email": f"l2_mm_cp_{ts}@test.com",
        "password": "TestPass123!",
    })
    resp = api.post("http://localhost:3000/api/auth/login", json={
        "email": f"l2_mm_cp_{ts}@test.com",
        "password": "TestPass123!",
    })
    api.headers["Authorization"] = f"Bearer {resp.json()['token']}"
    board = api.post("http://localhost:3000/api/boards", json={"name": f"MM CopyPaste {ts}"})
    board_id = board.json()["id"]
    # Create two mindmap canvases for cross-canvas paste test
    api.post(f"http://localhost:3000/api/boards/{board_id}/canvases", json={
        "name": "MM A", "type": "mindmap"
    })
    api.post(f"http://localhost:3000/api/boards/{board_id}/canvases", json={
        "name": "MM B", "type": "mindmap"
    })

    webbrowser.open(f"http://localhost:5173/board/{board_id}")
    time.sleep(4)
    coord.locate_window()
    time.sleep(2)
    tx, ty = coord.screen_xy(*coord.sidebar_tab(0))
    pyautogui.click(tx, ty)
    time.sleep(2)
    return coord


@pytest.mark.level2
def test_copy_paste_within_canvas(mindmap_editor):
    """Copy a node → paste → duplicate appears."""
    coord = mindmap_editor
    diff = ScreenshotDiff()

    # Build a few nodes
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.click(cx, cy)
    time.sleep(0.3)
    pyautogui.press("tab")
    time.sleep(0.3)

    before = diff.capture_fullscreen("l2_mm_cp_before")

    # Select root node and copy
    pyautogui.click(cx, cy)
    time.sleep(0.2)
    pyautogui.hotkey("ctrl", "c")
    time.sleep(0.3)
    pyautogui.hotkey("ctrl", "v")
    time.sleep(0.5)

    after = diff.capture_fullscreen("l2_mm_cp_after")

    from PIL import Image, ImageChops
    d = ImageChops.difference(Image.open(before), Image.open(after)).getdata()
    changed = sum(1 for px in d if px != (0, 0, 0)) / (len(d) * 3)
    print(f"  Copy-paste change: {changed:.2%}")
    assert changed > 0.0001, "Copy-paste should add a visible duplicate"


@pytest.mark.level2
def test_copy_paste_cross_canvas(mindmap_editor):
    """Copy node in Canvas A → switch to Canvas B → paste."""
    coord = mindmap_editor
    diff = ScreenshotDiff()

    # Create some nodes in Canvas A
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.click(cx, cy)
    time.sleep(0.3)
    pyautogui.press("tab")
    time.sleep(0.3)

    # Copy
    pyautogui.click(cx, cy)
    time.sleep(0.2)
    pyautogui.hotkey("ctrl", "c")
    time.sleep(0.3)

    # Switch to Canvas B via sidebar (tab index 1)
    tx, ty = coord.screen_xy(*coord.sidebar_tab(1))
    pyautogui.click(tx, ty)
    time.sleep(2)

    before = diff.capture_fullscreen("l2_mm_cross_canvas_before")

    # Paste into Canvas B
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.click(cx, cy)
    time.sleep(0.3)
    pyautogui.hotkey("ctrl", "v")
    time.sleep(0.5)

    after = diff.capture_fullscreen("l2_mm_cross_canvas_after")

    from PIL import Image, ImageChops
    d = ImageChops.difference(Image.open(before), Image.open(after)).getdata()
    changed = sum(1 for px in d if px != (0, 0, 0)) / (len(d) * 3)
    print(f"  Cross-canvas paste change: {changed:.2%}")
    assert changed > 0.0001, "Cross-canvas paste should add visible nodes"
