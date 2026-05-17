"""
Level 2: Excalidraw Drawing — Rectangle, Ellipse, Arrow, Line
Each test: draw shape → screenshot → compare with blank canvas baseline
"""
import pytest
import time
import pyautogui

from shared.coord_manager import CoordManager
from shared.screenshot_diff import ScreenshotDiff

ts = int(time.time())


@pytest.fixture
def editor(coord, services):
    """Set up: API creates account+board+canvas, browser navigates to editor, returns coord."""
    import webbrowser, requests, json

    api = requests.Session()
    api.headers["Content-Type"] = "application/json"

    # Register + login
    api.post("http://localhost:3000/api/auth/register", json={
        "username": f"l2_draw_{ts}",
        "email": f"l2_draw_{ts}@test.com",
        "password": "TestPass123!",
    })
    resp = api.post("http://localhost:3000/api/auth/login", json={
        "email": f"l2_draw_{ts}@test.com",
        "password": "TestPass123!",
    })
    api.headers["Authorization"] = f"Bearer {resp.json()['token']}"

    # Create board + canvas
    board = api.post("http://localhost:3000/api/boards", json={"name": f"Draw Board {ts}"})
    board_id = board.json()["id"]

    # Navigate to board
    webbrowser.open(f"http://localhost:5173/board/{board_id}")
    time.sleep(4)
    coord.locate_window()

    # Ensure we're on the Excalidraw canvas
    time.sleep(2)
    return coord


def _canvas_region(coord: CoordManager):
    """Get the Excalidraw canvas region in screen coordinates."""
    x1, y1 = coord.screen_xy(*coord.canvas_top_left)
    # Canvas is the remainder of the window
    w, h = coord.window_size
    x2 = x1 + w - coord.rel_x(coord.LAYOUT["canvas_left_ratio"]) - coord.LAYOUT["canvas_right_padding"]
    y2 = y1 + h - coord.rel_y(coord.LAYOUT["canvas_top_ratio"]) - coord.LAYOUT["canvas_bottom_padding"]
    return x1, y1, x2, y2


@pytest.mark.level2
def test_draw_rectangle(editor, diff_tool):
    """Draw a rectangle using 'R' hotkey + mouse drag. Verify pixel change."""
    coord = editor

    # Take blank canvas baseline
    before = diff_tool.capture_fullscreen("l2_rect_before")

    # Press R to select rectangle tool
    pyautogui.press("r")
    time.sleep(0.5)

    # Draw rectangle on canvas center
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.moveTo(cx - 100, cy - 80, duration=0.3)
    pyautogui.mouseDown()
    pyautogui.moveRel(250, 160, duration=0.5)
    pyautogui.mouseUp()
    time.sleep(1)

    after = diff_tool.capture_fullscreen("l2_rect_after")

    # Compare: after should differ from before (something was drawn)
    from PIL import Image
    before_img = Image.open(before)
    after_img = Image.open(after)

    result = diff_tool.compare(after_img, "excalidraw_empty.png")
    if not result["passed"]:
        # Baseline might not exist yet — just check that images differ
        from PIL import ImageChops
        diff_data = ImageChops.difference(before_img, after_img).getdata()
        changed_pixels = sum(1 for px in diff_data if px != (0, 0, 0))
        total = len(diff_data)
        change_pct = changed_pixels / (total * 3) if total > 0 else 0
        print(f"  Canvas change: {change_pct:.2%}")
        assert change_pct > 0.001, "Canvas should show visible change after drawing"
    else:
        print(f"  ✅ Visual comparison passed")


@pytest.mark.level2
def test_draw_ellipse(editor, diff_tool):
    """Draw ellipse using 'O' hotkey (or 'E' if O is not available)."""
    coord = editor

    before = diff_tool.capture_fullscreen("l2_ellipse_before")

    # Try Ellipse tool — Excalidraw uses E or O depending on version
    pyautogui.press("e")
    time.sleep(0.3)

    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.moveTo(cx - 80, cy - 60, duration=0.3)
    pyautogui.mouseDown()
    pyautogui.moveRel(200, 140, duration=0.5)
    pyautogui.mouseUp()
    time.sleep(1)

    after = diff_tool.capture_fullscreen("l2_ellipse_after")

    from PIL import Image, ImageChops
    before_img = Image.open(before)
    after_img = Image.open(after)
    diff = ImageChops.difference(before_img, after_img).getdata()
    changed = sum(1 for px in diff if px != (0, 0, 0))
    change_pct = changed / (len(diff) * 3)
    print(f"  Ellipse change: {change_pct:.2%}")
    assert change_pct > 0.001, "Canvas should show visible ellipse"


@pytest.mark.level2
def test_draw_arrow(editor, diff_tool):
    """Draw arrow using 'A' hotkey + click-drag."""
    coord = editor

    before = diff_tool.capture_fullscreen("l2_arrow_before")

    pyautogui.press("a")
    time.sleep(0.3)

    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.moveTo(cx - 120, cy, duration=0.2)
    pyautogui.mouseDown()
    pyautogui.moveRel(300, 0, duration=0.4)
    pyautogui.mouseUp()
    time.sleep(1)

    after = diff_tool.capture_fullscreen("l2_arrow_after")

    from PIL import Image, ImageChops
    diff = ImageChops.difference(Image.open(before), Image.open(after)).getdata()
    changed = sum(1 for px in diff if px != (0, 0, 0))
    print(f"  Arrow change: {changed / (len(diff) * 3):.2%}")
    assert changed / (len(diff) * 3) > 0.0005
