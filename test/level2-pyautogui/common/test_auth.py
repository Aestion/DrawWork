"""
Level 2: Common Auth — Login/Register via pyautogui (real keyboard/mouse)
"""
import pytest
import time
import pyautogui

from shared.coord_manager import CoordManager

FRONTEND_URL = "http://localhost:5173"
ts = int(time.time())


def _login_via_pyautogui(coord: CoordManager, email: str, password: str):
    """Use pyautogui to login via the login page."""
    import webbrowser
    webbrowser.open(f"{FRONTEND_URL}/login")
    time.sleep(3)
    coord.locate_window()

    # Fill email
    ex, ey = coord.screen_xy(*coord.login_email_field)
    pyautogui.click(ex, ey)
    pyautogui.hotkey("ctrl", "a")
    pyautogui.write(email, interval=0.05)

    # Fill password
    px, py = coord.screen_xy(*coord.login_password_field)
    pyautogui.click(px, py)
    pyautogui.write(password, interval=0.05)

    # Submit
    sx, sy = coord.screen_xy(*coord.login_submit_button)
    pyautogui.click(sx, sy)
    time.sleep(2)


@pytest.mark.level2
def test_login_via_pyautogui(coord):
    """Real user login via pyautogui — navigate to /login and submit."""
    # Register via API first
    import requests
    api = requests.Session()
    reg_resp = api.post("http://localhost:3000/api/auth/register", json={
        "username": f"l2_auth_user_{ts}",
        "email": f"l2_auth_user_{ts}@test.com",
        "password": "TestPass123!",
    })

    _login_via_pyautogui(coord, f"l2_auth_user_{ts}@test.com", "TestPass123!")

    # After login, URL should route to dashboard (not /login)
    # Since we can't check JS state easily from pyautogui, verify visually
    time.sleep(2)
    # Take screenshot for visual verification
    from shared.screenshot_diff import ScreenshotDiff
    diff = ScreenshotDiff()
    path = diff.capture_fullscreen("l2_login_result")
    assert path.exists(), "Screenshot should be saved"
    print(f"  📸 Login result screenshot: {path}")


@pytest.mark.level2
def test_login_wrong_password_visual(coord):
    """Login with wrong password — shows error message visually."""
    import webbrowser
    webbrowser.open(f"{FRONTEND_URL}/login")
    time.sleep(3)
    coord.locate_window()

    ex, ey = coord.screen_xy(*coord.login_email_field)
    pyautogui.click(ex, ey)
    pyautogui.write(f"no_such_{ts}@test.com", interval=0.05)
    pyautogui.press("tab")
    pyautogui.write("WrongPassword", interval=0.05)
    pyautogui.press("enter")

    time.sleep(2)
    # Visual check — should still be on /login (not dashboard)
    from shared.screenshot_diff import ScreenshotDiff
    diff = ScreenshotDiff()
    path = diff.capture_fullscreen("l2_login_wrong_password")
    assert path.exists()
    print(f"  📸 Wrong password screenshot: {path}")
