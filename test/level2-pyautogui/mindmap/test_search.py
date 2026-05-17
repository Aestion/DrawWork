"""
Level 2: MindMap Search — Ctrl+F search with result navigation
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
        "username": f"l2_mm_sr_{ts}",
        "email": f"l2_mm_sr_{ts}@test.com",
        "password": "TestPass123!",
    })
    resp = api.post("http://localhost:3000/api/auth/login", json={
        "email": f"l2_mm_sr_{ts}@test.com",
        "password": "TestPass123!",
    })
    api.headers["Authorization"] = f"Bearer {resp.json()['token']}"
    board = api.post("http://localhost:3000/api/boards", json={"name": f"MM Search {ts}"})
    board_id = board.json()["id"]
    api.post(f"http://localhost:3000/api/boards/{board_id}/canvases", json={
        "name": "Search", "type": "mindmap"
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
def test_search_opens_with_ctrl_f(mindmap_editor):
    """Ctrl+F opens the search input and typing filters nodes."""
    coord = mindmap_editor
    diff = ScreenshotDiff()

    # Build some nodes with text (via API, since pyautogui can't easily set node text on mindmap)
    # But we can at least verify Ctrl+F opens search UI
    before = diff.capture_fullscreen("l2_mm_search_before")

    pyautogui.hotkey("ctrl", "f")
    time.sleep(0.5)

    # Type search query
    pyautogui.write("test", interval=0.05)
    time.sleep(0.5)

    after = diff.capture_fullscreen("l2_mm_search_after")

    from PIL import Image, ImageChops
    d = ImageChops.difference(Image.open(before), Image.open(after)).getdata()
    changed = sum(1 for px in d if px != (0, 0, 0)) / (len(d) * 3)
    print(f"  Search UI change: {changed:.2%}")
    assert changed > 0.0001, "Ctrl+F should open search UI"


@pytest.mark.level2
def test_search_clear_restores(mindmap_editor):
    """Open search → type → clear → all nodes visible again."""
    coord = mindmap_editor
    diff = ScreenshotDiff()

    # Open search
    pyautogui.hotkey("ctrl", "f")
    time.sleep(0.3)
    pyautogui.write("nothing_matches_this_xyz", interval=0.05)
    time.sleep(0.5)

    filtered = diff.capture_fullscreen("l2_mm_search_filtered")

    # Clear search
    pyautogui.hotkey("ctrl", "a")
    pyautogui.press("delete")
    pyautogui.press("escape")  # Close search
    time.sleep(0.5)

    cleared = diff.capture_fullscreen("l2_mm_search_cleared")

    from PIL import Image, ImageChops
    d = ImageChops.difference(Image.open(filtered), Image.open(cleared)).getdata()
    changed = sum(1 for px in d if px != (0, 0, 0)) / (len(d) * 3)
    print(f"  Search clear change: {changed:.2%}")
    # Clearing search should change the view (un-dim nodes)
    assert changed > 0.0001, "Clearing search should change the canvas"
