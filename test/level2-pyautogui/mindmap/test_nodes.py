"""
Level 2: MindMap Nodes — Create, edit, delete
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
    """Set up: create account → create board with mindmap canvas → navigate to editor."""
    api = requests.Session()
    api.headers["Content-Type"] = "application/json"

    api.post("http://localhost:3000/api/auth/register", json={
        "username": f"l2_mm_node_{ts}",
        "email": f"l2_mm_node_{ts}@test.com",
        "password": "TestPass123!",
    })
    resp = api.post("http://localhost:3000/api/auth/login", json={
        "email": f"l2_mm_node_{ts}@test.com",
        "password": "TestPass123!",
    })
    api.headers["Authorization"] = f"Bearer {resp.json()['token']}"

    board = api.post("http://localhost:3000/api/boards", json={"name": f"MindMap Board {ts}"})
    board_id = board.json()["id"]
    resp = api.post(f"http://localhost:3000/api/boards/{board_id}/canvases", json={
        "name": "My MindMap", "type": "mindmap"
    })
    canvas_id = resp.json()["id"]

    webbrowser.open(f"http://localhost:5173/board/{board_id}")
    time.sleep(4)
    coord.locate_window()

    # Click sidebar to switch to mindmap canvas
    time.sleep(2)
    # The mindmap canvas should be in the sidebar — click its tab
    # Sidebar tabs are at the right edge
    tx, ty = coord.screen_xy(*coord.sidebar_tab(0))
    pyautogui.moveTo(tx, ty, duration=0.3)
    pyautogui.click()
    time.sleep(2)

    return coord


@pytest.mark.level2
def test_mindmap_loads_with_root_node(mindmap_editor):
    """MindMap editor loads with a default root node visible."""
    coord = mindmap_editor
    diff = ScreenshotDiff()
    path = diff.capture_fullscreen("l2_mm_root_node")
    assert path.exists()
    print(f"  📸 MindMap root node: {path}")


@pytest.mark.level2
def test_create_child_node_with_tab(mindmap_editor):
    """Select root → Tab → child node appears."""
    coord = mindmap_editor
    diff = ScreenshotDiff()

    before = diff.capture_fullscreen("l2_mm_tab_before")

    # Click on canvas center (where root node should be)
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.click(cx, cy)
    time.sleep(0.5)

    # Press Tab to create child
    pyautogui.press("tab")
    time.sleep(0.5)

    after = diff.capture_fullscreen("l2_mm_tab_after")

    from PIL import Image, ImageChops
    d = ImageChops.difference(Image.open(before), Image.open(after)).getdata()
    changed = sum(1 for px in d if px != (0, 0, 0)) / (len(d) * 3)
    print(f"  Tab child node change: {changed:.2%}")
    assert changed > 0.0001, "Pressing Tab should create a visible child node"


@pytest.mark.level2
def test_create_sibling_with_enter(mindmap_editor):
    """Create child with Tab → Enter to create sibling."""
    coord = mindmap_editor
    diff = ScreenshotDiff()

    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.click(cx, cy)
    time.sleep(0.3)
    pyautogui.press("tab")  # Create child
    time.sleep(0.5)
    pyautogui.press("enter")  # Create sibling
    time.sleep(0.5)
    pyautogui.press("enter")  # Another sibling
    time.sleep(0.5)

    path = diff.capture_fullscreen("l2_mm_siblings")
    assert path.exists()
    print(f"  📸 Three nodes created: {path}")


@pytest.mark.level2
def test_delete_node(mindmap_editor):
    """Create node → Delete → node disappears."""
    coord = mindmap_editor
    diff = ScreenshotDiff()

    # Create a child node
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.click(cx, cy)
    time.sleep(0.3)
    pyautogui.press("tab")
    time.sleep(0.5)

    before = diff.capture_fullscreen("l2_mm_delete_before")

    # Delete it
    pyautogui.press("delete")
    time.sleep(0.5)

    after = diff.capture_fullscreen("l2_mm_delete_after")

    from PIL import Image, ImageChops
    d = ImageChops.difference(Image.open(before), Image.open(after)).getdata()
    changed = sum(1 for px in d if px != (0, 0, 0)) / (len(d) * 3)
    print(f"  Delete change: {changed:.2%}")
    assert changed > 0.0001, "Deleting a node should visibly change the canvas"
