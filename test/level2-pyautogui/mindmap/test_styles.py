"""
Level 2: MindMap Styles — Color, font, border modification
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
        "username": f"l2_mm_style_{ts}",
        "email": f"l2_mm_style_{ts}@test.com",
        "password": "TestPass123!",
    })
    resp = api.post("http://localhost:3000/api/auth/login", json={
        "email": f"l2_mm_style_{ts}@test.com",
        "password": "TestPass123!",
    })
    api.headers["Authorization"] = f"Bearer {resp.json()['token']}"
    board = api.post("http://localhost:3000/api/boards", json={"name": f"MM Style {ts}"})
    board_id = board.json()["id"]
    api.post(f"http://localhost:3000/api/boards/{board_id}/canvases", json={
        "name": "Style", "type": "mindmap"
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
def test_style_panel_opens(mindmap_editor):
    """Click style button → style panel appears."""
    coord = mindmap_editor
    diff = ScreenshotDiff()

    before = diff.capture_fullscreen("l2_mm_style_before")

    # The style button is typically in the toolbar, index ~3-4
    tx, ty = coord.screen_xy(*coord.toolbar_button(4))
    pyautogui.moveTo(tx, ty, duration=0.3)
    pyautogui.click()
    time.sleep(0.5)

    after = diff.capture_fullscreen("l2_mm_style_after")

    from PIL import Image, ImageChops
    d = ImageChops.difference(Image.open(before), Image.open(after)).getdata()
    changed = sum(1 for px in d if px != (0, 0, 0)) / (len(d) * 3)
    print(f"  Style panel change: {changed:.2%}")
    assert changed > 0.0001, "Style panel should visibly appear"


@pytest.mark.level2
def test_change_background_color(mindmap_editor):
    """Open style panel, click a color, verify canvas changes."""
    coord = mindmap_editor
    diff = ScreenshotDiff()

    # Select a node first
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.click(cx, cy)
    time.sleep(0.3)

    before = diff.capture_fullscreen("l2_mm_color_before")

    # Open style panel
    tx, ty = coord.screen_xy(*coord.toolbar_button(4))
    pyautogui.click(tx, ty)
    time.sleep(0.3)

    # Click a color swatch (approx position within style panel)
    # Style panel opens near center — click a color button
    pyautogui.moveTo(cx - 100, cy + 50, duration=0.3)
    pyautogui.click()
    time.sleep(0.5)

    after = diff.capture_fullscreen("l2_mm_color_after")

    from PIL import Image, ImageChops
    d = ImageChops.difference(Image.open(before), Image.open(after)).getdata()
    changed = sum(1 for px in d if px != (0, 0, 0)) / (len(d) * 3)
    print(f"  Color change diff: {changed:.2%}")
    assert changed > 0.0001, "Changing color should visually change the node"
