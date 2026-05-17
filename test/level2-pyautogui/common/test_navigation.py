"""
Level 2: Common Navigation — Dashboard → Editor → Canvas switching
"""
import pytest
import time
import pyautogui
import webbrowser

from shared.coord_manager import CoordManager
from shared.screenshot_diff import ScreenshotDiff

FRONTEND_URL = "http://localhost:5173"
ts = int(time.time())


def _ensure_logged_in(coord: CoordManager):
    """Use API to create account + login via browser."""
    import requests
    api = requests.Session()
    api.post("http://localhost:3000/api/auth/register", json={
        "username": f"l2_nav_{ts}",
        "email": f"l2_nav_{ts}@test.com",
        "password": "TestPass123!",
    })
    login_resp = api.post("http://localhost:3000/api/auth/login", json={
        "email": f"l2_nav_{ts}@test.com",
        "password": "TestPass123!",
    })
    token = login_resp.json().get("token", "")
    if token:
        api.headers["Authorization"] = f"Bearer {token}"

    # Navigate and login via browser
    webbrowser.open(f"{FRONTEND_URL}/login")
    time.sleep(3)
    coord.locate_window()

    # Fill and submit login
    ex, ey = coord.screen_xy(*coord.login_email_field)
    pyautogui.click(ex, ey)
    pyautogui.hotkey("ctrl", "a")
    pyautogui.write(f"l2_nav_{ts}@test.com", interval=0.05)
    pyautogui.press("tab")
    pyautogui.write("TestPass123!", interval=0.05)
    pyautogui.press("enter")
    time.sleep(3)
    coord.locate_window()

    return api


@pytest.mark.level2
def test_dashboard_to_editor_navigation(coord):
    """Navigate: login → dashboard → click board → enter editor."""
    api = _ensure_logged_in(coord)

    # Create a board via API
    board_resp = api.post("http://localhost:3000/api/boards", json={
        "name": f"Nav Board {ts}",
        "description": "Navigation test",
    }, headers={"Authorization": api.headers.get("Authorization", "")})
    assert board_resp.status_code == 201, board_resp.text

    # Refresh the page to see the board
    pyautogui.hotkey("ctrl", "r")
    time.sleep(3)
    coord.locate_window()
    pyautogui.press("f5")  # extra refresh
    time.sleep(2)

    # Take screenshot of dashboard with board visible
    diff = ScreenshotDiff()
    path = diff.capture_fullscreen("l2_dashboard_with_board")
    assert path.exists()
    print(f"  📸 Dashboard with board: {path}")

    # Click the board card (center of screen, where board cards appear)
    cx, cy = coord.screen_xy(*coord.canvas_center)
    # Board cards are typically in the center grid area
    pyautogui.moveTo(cx - 200, cy - 100, duration=0.5)
    pyautogui.click()
    time.sleep(2)

    path2 = diff.capture_fullscreen("l2_editor_after_nav")
    assert path2.exists()
    print(f"  📸 Editor after navigation: {path2}")


@pytest.mark.level2
def test_canvas_switch(coord):
    """Navigate to editor → switch between canvases via sidebar."""
    import requests
    api = requests.Session()
    api.post("http://localhost:3000/api/auth/register", json={
        "username": f"l2_cs_{ts}",
        "email": f"l2_cs_{ts}@test.com",
        "password": "TestPass123!",
    })
    resp = api.post("http://localhost:3000/api/auth/login", json={
        "email": f"l2_cs_{ts}@test.com",
        "password": "TestPass123!",
    })
    token = resp.json()["token"]
    api.headers["Authorization"] = f"Bearer {token}"

    # Create board + 2 canvases
    board = api.post("http://localhost:3000/api/boards", json={"name": f"Switch Board {ts}"})
    board_id = board.json()["id"]
    api.post(f"http://localhost:3000/api/boards/{board_id}/canvases", json={
        "name": "Canvas A", "type": "excalidraw"
    })
    api.post(f"http://localhost:3000/api/boards/{board_id}/canvases", json={
        "name": "Canvas B", "type": "excalidraw"
    })

    # Navigate to board
    webbrowser.open(f"{FRONTEND_URL}/board/{board_id}")
    time.sleep(4)
    coord.locate_window()

    diff = ScreenshotDiff()
    path = diff.capture_fullscreen("l2_canvas_switch_before")
    assert path.exists()

    # Click sidebar tab (index 1 = second canvas)
    tx, ty = coord.screen_xy(*coord.sidebar_tab(1))
    pyautogui.moveTo(tx, ty, duration=0.3)
    pyautogui.click()
    time.sleep(2)

    path2 = diff.capture_fullscreen("l2_canvas_switch_after")
    assert path2.exists()
    print(f"  📸 Canvas switch: {path} → {path2}")
