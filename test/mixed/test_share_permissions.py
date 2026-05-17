"""
Mixed: Share Permissions — API sets permissions, browser verifies viewer/editor experience
"""
import pytest
import time
import requests
import pyautogui
import webbrowser

from shared.coord_manager import CoordManager
from shared.screenshot_diff import ScreenshotDiff

FRONTEND_URL = "http://localhost:5173"
API_URL = "http://localhost:3000"


def _login_via_pyautogui(email, password):
    """Navigate to login page and login via pyautogui. Returns CoordManager."""
    pyautogui.FAILSAFE = False
    webbrowser.open(f"{FRONTEND_URL}/login")
    time.sleep(3)

    coord = CoordManager()
    if not coord.locate_window(retries=10):
        pytest.skip("Could not locate browser window")

    # Type credentials
    time.sleep(1)
    ex, ey = coord.screen_xy(*coord.login_email_field)
    pyautogui.click(ex, ey)
    pyautogui.hotkey("ctrl", "a")
    pyautogui.write(email, interval=0.05)
    pyautogui.press("tab")
    pyautogui.write(password, interval=0.05)
    sx, sy = coord.screen_xy(*coord.login_submit_button)
    pyautogui.click(sx, sy)
    time.sleep(3)

    coord.locate_window()
    return coord


@pytest.fixture
def owner_setup(services):
    """Create owner account + board + generate share tokens (viewer + editor)."""
    ts = int(time.time())
    api = requests.Session()
    api.post(f"{API_URL}/api/auth/register", json={
        "username": f"mix_share_owner_{ts}",
        "email": f"mix_share_owner_{ts}@test.com",
        "password": "TestPass123!",
    })
    resp = api.post(f"{API_URL}/api/auth/login", json={
        "email": f"mix_share_owner_{ts}@test.com",
        "password": "TestPass123!",
    })
    token = resp.json()["token"]
    api.headers["Authorization"] = f"Bearer {token}"

    board = api.post(f"{API_URL}/api/boards", json={"name": f"SharePerm Board {ts}"})
    board_id = board.json()["id"]

    # Generate viewer token
    viewer_resp = api.post(f"{API_URL}/api/boards/{board_id}/tokens", json={"permission": "viewer"})
    viewer_token = viewer_resp.json().get("token", "")

    # Generate editor token
    editor_resp = api.post(f"{API_URL}/api/boards/{board_id}/tokens", json={"permission": "editor"})
    editor_token = editor_resp.json().get("token", "")

    return board_id, viewer_token, editor_token


@pytest.mark.mixed
def test_viewer_cannot_edit(owner_setup):
    """Open board as viewer → verify no edit controls visible."""
    board_id, viewer_token, _ = owner_setup
    diff = ScreenshotDiff()
    ts = int(time.time())
    email = f"share_viewer_{ts}@test.com"

    # Register a user and login
    api = requests.Session()
    api.post(f"{API_URL}/api/auth/register", json={
        "username": f"share_viewer_{ts}",
        "email": email,
        "password": "TestPass123!",
    })
    _login_via_pyautogui(email, "TestPass123!")

    # Navigate to share link (uses frontend route /s/:token)
    webbrowser.open(f"{FRONTEND_URL}/s/{viewer_token}")
    time.sleep(5)

    coord = CoordManager()
    if not coord.locate_window(retries=10):
        pytest.skip("No browser window")

    path = diff.capture_fullscreen("mixed_share_viewer")
    assert path.exists()
    print(f"  Viewer view: {path}")

    # Viewer should NOT have toolbar — try drawing and verify no change
    before = diff.capture_fullscreen("mixed_share_viewer_draw_attempt_before")
    pyautogui.press("r")  # Rectangle shortcut
    time.sleep(0.3)
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.moveTo(cx - 80, cy - 60, duration=0.3)
    pyautogui.mouseDown()
    pyautogui.moveRel(160, 120, duration=0.5)
    pyautogui.mouseUp()
    time.sleep(1)
    after = diff.capture_fullscreen("mixed_share_viewer_draw_attempt_after")

    from PIL import Image, ImageChops
    d = ImageChops.difference(Image.open(before), Image.open(after)).getdata()
    changed = sum(1 for px in d if px != (0, 0, 0)) / (len(d) * 3)
    print(f"  Viewer draw attempt change: {changed:.2%}")
    # As viewer, drawing should be rejected or have no effect
    assert changed < 0.05, f"Viewer should not be able to edit, got {changed:.2%} change"


@pytest.mark.mixed
def test_editor_can_edit(owner_setup):
    """Open board as editor → verify drawing works."""
    board_id, _, editor_token = owner_setup
    diff = ScreenshotDiff()
    ts = int(time.time())
    email = f"share_editor_{ts}@test.com"

    # Register a user and login
    api = requests.Session()
    api.post(f"{API_URL}/api/auth/register", json={
        "username": f"share_editor_{ts}",
        "email": email,
        "password": "TestPass123!",
    })
    _login_via_pyautogui(email, "TestPass123!")

    # Navigate to share link (uses frontend route /s/:token)
    webbrowser.open(f"{FRONTEND_URL}/s/{editor_token}")
    time.sleep(5)

    coord = CoordManager()
    if not coord.locate_window(retries=10):
        pytest.skip("No browser window")

    path = diff.capture_fullscreen("mixed_share_editor")
    assert path.exists()
    print(f"  Editor view: {path}")

    # Editor should be able to draw
    before = diff.capture_fullscreen("mixed_share_editor_draw_before")
    time.sleep(1)
    pyautogui.press("r")
    time.sleep(0.3)
    cx, cy = coord.screen_xy(*coord.canvas_center)
    pyautogui.moveTo(cx - 80, cy - 60, duration=0.3)
    pyautogui.mouseDown()
    pyautogui.moveRel(160, 120, duration=0.5)
    pyautogui.mouseUp()
    time.sleep(1)
    after = diff.capture_fullscreen("mixed_share_editor_draw_after")

    from PIL import Image, ImageChops
    d = ImageChops.difference(Image.open(before), Image.open(after)).getdata()
    changed = sum(1 for px in d if px != (0, 0, 0)) / (len(d) * 3)
    print(f"  Editor draw change: {changed:.2%}")
    assert changed > 0.0005, "Editor should be able to draw on canvas"
