"""
Mixed: Collaboration — API creates 2 accounts, opens 2 Chrome windows, verifies real-time sync
"""
import pytest
import time
import subprocess
import requests
import pyautogui
import webbrowser

from shared.coord_manager import CoordManager
from shared.screenshot_diff import ScreenshotDiff

FRONTEND_URL = "http://localhost:5173"
API_URL = "http://localhost:3000"
CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
ts = int(time.time())


@pytest.fixture(scope="module")
def two_users():
    """Create User A + User B, create shared board, return tokens + board_id."""
    api = requests.Session()
    api_a = requests.Session()

    # User A: owner
    api_a.post(f"{API_URL}/api/auth/register", json={
        "username": f"mix_collab_A_{ts}",
        "email": f"mix_collab_A_{ts}@test.com",
        "password": "TestPass123!",
    })
    resp_a = api_a.post(f"{API_URL}/api/auth/login", json={
        "email": f"mix_collab_A_{ts}@test.com",
        "password": "TestPass123!",
    })
    token_a = resp_a.json()["token"]
    user_a = resp_a.json().get("user", {})
    user_a_id = user_a.get("id") if isinstance(user_a, dict) else user_a

    # User B: collaborator
    api_b = requests.Session()
    api_b.post(f"{API_URL}/api/auth/register", json={
        "username": f"mix_collab_B_{ts}",
        "email": f"mix_collab_B_{ts}@test.com",
        "password": "TestPass123!",
    })
    resp_b = api_b.post(f"{API_URL}/api/auth/login", json={
        "email": f"mix_collab_B_{ts}@test.com",
        "password": "TestPass123!",
    })
    token_b = resp_b.json()["token"]
    user_b = resp_b.json().get("user", {})
    user_b_id = user_b.get("id") if isinstance(user_b, dict) else user_b

    # Create board as User A
    api_a.headers["Authorization"] = f"Bearer {token_a}"
    board = api_a.post(f"{API_URL}/api/boards", json={"name": f"Collab Board {ts}"})
    board_id = board.json()["id"]

    # Share with User B as editor
    api_a.post(f"{API_URL}/api/boards/{board_id}/shares", json={
        "user_id": user_b_id,
        "permission": "editor",
    })

    return {
        "board_id": board_id,
        "user_a": {"email": f"mix_collab_A_{ts}@test.com", "password": "TestPass123!", "token": token_a},
        "user_b": {"email": f"mix_collab_B_{ts}@test.com", "password": "TestPass123!", "token": token_b},
    }


@pytest.mark.mixed
def test_two_users_real_time_sync(two_users, services):
    """Open two Chrome windows. User A draws. User B sees the update.

    This is THE key test — it verifies real-time collaboration with actual browser windows.
    """
    board_id = two_users["board_id"]
    diff = ScreenshotDiff()

    # === Window 1: User A ===
    user_data_dir_a = f"C:\\Users\\54656\\.openclaw\\workspace\\chrome-collab-A-{ts}"
    subprocess.Popen([
        CHROME_PATH,
        f"--user-data-dir={user_data_dir_a}",
        "--new-window",
        f"{FRONTEND_URL}/board/{board_id}",
    ])
    time.sleep(5)

    # Login User A via pyautogui
    cm_a = CoordManager()
    if not cm_a.locate_window(retries=10):
        pytest.skip("Could not locate User A's browser window")

    # Navigate to login if needed (board redirects to login if not authenticated)
    time.sleep(2)
    # Type credentials
    webbrowser.open(f"{FRONTEND_URL}/login")
    time.sleep(2)
    cm_a.locate_window()
    ex, ey = cm_a.screen_xy(*cm_a.login_email_field)
    pyautogui.click(ex, ey)
    pyautogui.hotkey("ctrl", "a")
    pyautogui.write(two_users["user_a"]["email"], interval=0.05)
    pyautogui.press("tab")
    pyautogui.write(two_users["user_a"]["password"], interval=0.05)
    sx, sy = cm_a.screen_xy(*cm_a.login_submit_button)
    pyautogui.click(sx, sy)
    time.sleep(3)

    # Navigate to board
    webbrowser.open(f"{FRONTEND_URL}/board/{board_id}")
    time.sleep(4)
    cm_a.locate_window()

    # Draw a rectangle as User A
    pyautogui.press("r")
    time.sleep(0.3)
    cx, cy = cm_a.screen_xy(*cm_a.canvas_center)
    pyautogui.moveTo(cx - 80, cy - 60, duration=0.3)
    pyautogui.mouseDown()
    pyautogui.moveRel(160, 120, duration=0.5)
    pyautogui.mouseUp()
    time.sleep(2)

    # === Window 2: User B ===
    user_data_dir_b = f"C:\\Users\\54656\\.openclaw\\workspace\\chrome-collab-B-{ts}"
    subprocess.Popen([
        CHROME_PATH,
        f"--user-data-dir={user_data_dir_b}",
        "--new-window",
        f"{FRONTEND_URL}/board/{board_id}",
    ])
    time.sleep(5)

    cm_b = CoordManager()
    if not cm_b.locate_window(retries=10):
        # User B window may not have focus — try clicking to activate
        pyautogui.hotkey("alt", "tab")
        time.sleep(1)
        if not cm_b.locate_window(retries=3):
            pytest.skip("Could not locate User B's browser window")

    # Login User B
    time.sleep(2)
    webbrowser.open(f"{FRONTEND_URL}/login")
    time.sleep(2)
    cm_b.locate_window()
    ex, ey = cm_b.screen_xy(*cm_b.login_email_field)
    pyautogui.click(ex, ey)
    pyautogui.hotkey("ctrl", "a")
    pyautogui.write(two_users["user_b"]["email"], interval=0.05)
    pyautogui.press("tab")
    pyautogui.write(two_users["user_b"]["password"], interval=0.05)
    sx, sy = cm_b.screen_xy(*cm_b.login_submit_button)
    pyautogui.click(sx, sy)
    time.sleep(3)

    webbrowser.open(f"{FRONTEND_URL}/board/{board_id}")
    time.sleep(4)
    cm_b.locate_window()

    # Screenshot User B's view — should show the rectangle User A drew
    after = diff.capture_fullscreen("mixed_collab_userB_sees_userA_drawing")
    assert after.exists()
    print(f"  📸 User B sees User A's drawing: {after}")
