"""
Level 2 conftest — shared fixtures for pyautogui tests.
"""
import pytest
import sys
import os
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from service_manager.manager import ServiceManager
from shared.coord_manager import CoordManager
from shared.screenshot_diff import ScreenshotDiff

FRONTEND_URL = "http://localhost:5173"


def _has_display():
    """Check if we have a real display (pyautogui needs one)."""
    if sys.platform != "win32":
        return False
    try:
        import pyautogui
        pyautogui.size()
        return True
    except Exception:
        return False


def _services_already_running():
    """Check if DrawWork services are already running."""
    import socket
    for port in [3000, 5173]:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1)
        result = s.connect_ex(("localhost", port))
        s.close()
        if result != 0:
            return False
    return True


# ─── session fixtures ──────────────────────────────────────

@pytest.fixture(scope="session")
def has_display():
    return _has_display()


@pytest.fixture(scope="session")
def services():
    """Start services (session-scoped). Skip if already running."""
    if _services_already_running():
        print("  Services already running — reusing.")
        yield None
        return

    mgr = ServiceManager(headless=False)
    mgr.start_all(reset_db=False)
    yield mgr
    mgr.stop_all()


# ─── function fixtures ─────────────────────────────────────

@pytest.fixture
def coord():
    """CoordManager — locate browser window. Skip if no display."""
    if not _has_display():
        pytest.skip("No display available — pyautogui requires a real screen")
    cm = CoordManager()
    if not cm.locate_window(retries=10):
        pytest.skip("Could not locate DrawWork browser window")
    return cm


@pytest.fixture
def diff_tool():
    return ScreenshotDiff()


@pytest.fixture
def logged_in_page(coord):
    """Navigate to DrawWork, login via API, set token in localStorage. Returns coord."""
    import pyautogui
    import requests

    # Navigate to DrawWork
    import webbrowser
    webbrowser.open(FRONTEND_URL)
    import time
    time.sleep(3)
    coord.locate_window()

    # Use API to register + login, then inject token
    api = requests.Session()
    ts = int(time.time())
    resp = api.post("http://localhost:3000/api/auth/register", json={
        "username": f"l2_user_{ts}",
        "email": f"l2_user_{ts}@test.com",
        "password": "TestPass123!",
    })
    if resp.status_code == 201:
        token = resp.json().get("token", "")
    else:
        resp = api.post("http://localhost:3000/api/auth/login", json={
            "email": f"l2_user_{ts}@test.com",
            "password": "TestPass123!",
        })
        token = resp.json().get("token", "")

    # Inject token via JS console (Playwright could do this; pyautogui can't easily)
    # Instead, use the login page
    x, y = coord.screen_xy(*coord.login_email_field)
    pyautogui.click(x, y)
    pyautogui.hotkey("ctrl", "a")
    pyautogui.write(f"l2_user_{ts}@test.com", interval=0.05)
    pyautogui.press("tab")
    pyautogui.write("TestPass123!", interval=0.05)
    pyautogui.press("enter")
    time.sleep(3)

    coord.locate_window()
    return coord
