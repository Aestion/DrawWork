"""
Level 2: MindMap Collapse/Expand — Toggle visibility of child nodes
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
        "username": f"l2_mm_col_{ts}",
        "email": f"l2_mm_col_{ts}@test.com",
        "password": "TestPass123!",
    })
    resp = api.post("http://localhost:3000/api/auth/login", json={
        "email": f"l2_mm_col_{ts}@test.com",
        "password": "TestPass123!",
    })
    api.headers["Authorization"] = f"Bearer {resp.json()['token']}"
    board = api.post("http://localhost:3000/api/boards", json={"name": f"MM Collapse {ts}"})
    board_id = board.json()["id"]
    api.post(f"http://localhost:3000/api/boards/{board_id}/canvases", json={
        "name": "Collapse", "type": "mindmap"
    })

    webbrowser.open(f"http://localhost:5173/board/{board_id}")
    time.sleep(4)
    coord.locate_window()
    time.sleep(2)
    tx, ty = coord.screen_xy(*coord.sidebar_tab(0))
    pyautogui.click(tx, ty)
    time.sleep(2)
    return coord


def _build_tree(coord, depth=2):
    """Build a simple tree: root → child → grandchild."""
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.click(cx, cy)
    time.sleep(0.3)
    for _ in range(depth):
        pyautogui.press("tab")
        time.sleep(0.3)


@pytest.mark.level2
def test_collapse_hides_children(mindmap_editor):
    """Click collapse button → child nodes become invisible."""
    coord = mindmap_editor
    diff = ScreenshotDiff()

    _build_tree(coord, depth=2)
    before = diff.capture_fullscreen("l2_mm_collapse_before")

    # Click the collapse icon on root node
    # The collapse icon is usually to the left of the node
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.click(cx - 20, cy)  # click collapse icon area
    time.sleep(0.5)

    after = diff.capture_fullscreen("l2_mm_collapse_after")

    from PIL import Image, ImageChops
    d = ImageChops.difference(Image.open(before), Image.open(after)).getdata()
    changed = sum(1 for px in d if px != (0, 0, 0)) / (len(d) * 3)
    print(f"  Collapse change: {changed:.2%}")
    # Collapsing should change the appearance
    assert changed > 0.0001, "Collapsing should visually hide children"


@pytest.mark.level2
def test_expand_restores_children(mindmap_editor):
    """Collapse then expand → children visible again."""
    coord = mindmap_editor
    diff = ScreenshotDiff()

    _build_tree(coord, depth=2)
    modified = diff.capture_fullscreen("l2_mm_expand_state1")

    # Collapse
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.click(cx - 20, cy)
    time.sleep(0.5)

    # Expand
    pyautogui.click(cx - 20, cy)
    time.sleep(0.5)

    restored = diff.capture_fullscreen("l2_mm_expand_restored")

    from PIL import Image, ImageChops
    d = ImageChops.difference(Image.open(modified), Image.open(restored)).getdata()
    changed = sum(1 for px in d if px != (0, 0, 0)) / (len(d) * 3)
    print(f"  Expand-restore diff: {changed:.2%}")
    # After expand, should be similar to original (same nodes visible)
    assert changed < 0.05, f"Expanding should restore to similar state, got {changed:.2%}"
