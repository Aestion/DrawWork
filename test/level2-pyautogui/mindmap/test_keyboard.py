"""
Level 2: MindMap Keyboard Navigation — Arrow keys, Ctrl+Enter, Tab/Enter combos
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
def mindmap_editor(coord, services):
    api = requests.Session()
    api.headers["Content-Type"] = "application/json"
    api.post("http://localhost:3000/api/auth/register", json={
        "username": f"l2_mm_kb_{ts}",
        "email": f"l2_mm_kb_{ts}@test.com",
        "password": "TestPass123!",
    })
    resp = api.post("http://localhost:3000/api/auth/login", json={
        "email": f"l2_mm_kb_{ts}@test.com",
        "password": "TestPass123!",
    })
    api.headers["Authorization"] = f"Bearer {resp.json()['token']}"
    board = api.post("http://localhost:3000/api/boards", json={"name": f"MM KB Board {ts}"})
    board_id = board.json()["id"]
    api.post(f"http://localhost:3000/api/boards/{board_id}/canvases", json={
        "name": "KB MindMap", "type": "mindmap"
    })

    webbrowser.open(f"http://localhost:5173/board/{board_id}")
    time.sleep(4)
    coord.locate_window()
    time.sleep(2)

    # Click sidebar tab for mindmap
    tx, ty = coord.screen_xy(*coord.sidebar_tab(0))
    pyautogui.click(tx, ty)
    time.sleep(2)

    return coord


@pytest.mark.level2
def test_arrow_navigation(mindmap_editor):
    """Arrow keys move focus between nodes in mindmap."""
    coord = mindmap_editor

    # Create a structure: root → child1, child2
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.click(cx, cy)
    time.sleep(0.3)
    pyautogui.press("tab")
    time.sleep(0.3)
    pyautogui.press("enter")
    time.sleep(0.3)

    # Now use arrow keys to navigate — should not crash or error
    for key in ["down", "up", "right", "left"]:
        pyautogui.press(key)
        time.sleep(0.3)
        print(f"  Navigated: {key}")
        # No assertion — just verify no crash


@pytest.mark.level2
def test_ctrl_enter_multi_root(mindmap_editor):
    """Ctrl+Enter creates a new independent root node."""
    coord = mindmap_editor
    diff = ScreenshotDiff()

    before = diff.capture_fullscreen("l2_mm_multiroot_before")

    # Create two extra root nodes
    for _ in range(2):
        pyautogui.hotkey("ctrl", "enter")
        time.sleep(0.5)

    after = diff.capture_fullscreen("l2_mm_multiroot_after")

    from PIL import Image, ImageChops
    d = ImageChops.difference(Image.open(before), Image.open(after)).getdata()
    changed = sum(1 for px in d if px != (0, 0, 0)) / (len(d) * 3)
    print(f"  Multi-root change: {changed:.2%}")
    assert changed > 0.0001, "Creating multiple roots should change canvas"


@pytest.mark.level2
def test_tab_enter_combo_creates_tree(mindmap_editor):
    """Tab → enter → Tab creates a complex tree structure."""
    coord = mindmap_editor
    diff = ScreenshotDiff()

    before = diff.capture_fullscreen("l2_mm_tree_before")

    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.click(cx, cy)
    time.sleep(0.3)

    # Build: root → child(A Tab) + sibling(B Enter), then child of A
    pyautogui.press("tab")       # root → child1
    time.sleep(0.3)
    pyautogui.press("enter")     # child1 → child2 (sibling)
    time.sleep(0.3)
    pyautogui.press("tab")       # child2 → grandchild
    time.sleep(0.3)

    after = diff.capture_fullscreen("l2_mm_tree_after")

    from PIL import Image, ImageChops
    d = ImageChops.difference(Image.open(before), Image.open(after)).getdata()
    changed = sum(1 for px in d if px != (0, 0, 0)) / (len(d) * 3)
    print(f"  Tree structure change: {changed:.2%}")
    assert changed > 0.0001
