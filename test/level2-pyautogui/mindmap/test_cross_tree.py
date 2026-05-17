"""
Level 2: MindMap Cross-Tree Connection — Shift+Click to create + Delete to remove
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
        "username": f"l2_mm_xt_{ts}",
        "email": f"l2_mm_xt_{ts}@test.com",
        "password": "TestPass123!",
    })
    resp = api.post("http://localhost:3000/api/auth/login", json={
        "email": f"l2_mm_xt_{ts}@test.com",
        "password": "TestPass123!",
    })
    api.headers["Authorization"] = f"Bearer {resp.json()['token']}"
    board = api.post("http://localhost:3000/api/boards", json={"name": f"MM CrossTree {ts}"})
    board_id = board.json()["id"]
    api.post(f"http://localhost:3000/api/boards/{board_id}/canvases", json={
        "name": "CrossTree", "type": "mindmap"
    })

    webbrowser.open(f"http://localhost:5173/board/{board_id}")
    time.sleep(4)
    coord.locate_window()
    time.sleep(2)
    tx, ty = coord.screen_xy(*coord.sidebar_tab(0))
    pyautogui.click(tx, ty)
    time.sleep(2)
    return coord


def _create_two_roots(coord):
    """Create two root nodes for cross-tree connection testing."""
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.click(cx, cy)
    time.sleep(0.3)
    pyautogui.hotkey("ctrl", "enter")  # Root 2
    time.sleep(0.5)


@pytest.mark.level2
def test_create_cross_tree_connection(mindmap_editor):
    """Shift+Click from root A to root B creates a dashed cross-tree line."""
    coord = mindmap_editor
    diff = ScreenshotDiff()

    _create_two_roots(coord)

    before = diff.capture_fullscreen("l2_mm_cross_before")

    # Click root 1
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.click(cx, cy)
    time.sleep(0.3)

    # Shift+Click on root 2 (should be offset below)
    pyautogui.keyDown("shift")
    pyautogui.click(cx, cy + 80)
    pyautogui.keyUp("shift")
    time.sleep(0.5)

    after = diff.capture_fullscreen("l2_mm_cross_after")

    from PIL import Image, ImageChops
    d = ImageChops.difference(Image.open(before), Image.open(after)).getdata()
    changed = sum(1 for px in d if px != (0, 0, 0)) / (len(d) * 3)
    print(f"  Cross-tree connection change: {changed:.2%}")
    assert changed > 0.0001, "Cross-tree connection should be visible"


@pytest.mark.level2
def test_delete_cross_tree_connection(mindmap_editor):
    """Create cross-tree connection → select line → Delete → line disappears."""
    coord = mindmap_editor
    diff = ScreenshotDiff()

    _create_two_roots(coord)

    # Create connection
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.click(cx, cy)
    time.sleep(0.3)
    pyautogui.keyDown("shift")
    pyautogui.click(cx, cy + 80)
    pyautogui.keyUp("shift")
    time.sleep(0.5)

    connected = diff.capture_fullscreen("l2_mm_cross_delete_before")

    # Click near where the connection line should be
    pyautogui.click(cx, cy + 40)
    time.sleep(0.3)
    pyautogui.press("delete")
    time.sleep(0.5)

    deleted = diff.capture_fullscreen("l2_mm_cross_delete_after")

    from PIL import Image, ImageChops
    d = ImageChops.difference(Image.open(connected), Image.open(deleted)).getdata()
    changed = sum(1 for px in d if px != (0, 0, 0)) / (len(d) * 3)
    print(f"  Delete cross-tree change: {changed:.2%}")
    assert changed > 0.0001, "Deleting connection should change the view"
