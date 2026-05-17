"""
Service Manager — DrawWork 服务生命周期管理
启动/停止/健康检查 三服务 (backend + yjs + frontend)
"""
import subprocess
import socket
import time
import os
import sys
import signal
from pathlib import Path
from datetime import datetime

ROOT_DIR = Path(__file__).resolve().parent.parent.parent

BACKEND_PORT = int(os.environ.get("DW_BACKEND_PORT", "3000"))
YJS_PORT = int(os.environ.get("DW_YJS_PORT", "3001"))
FRONTEND_PORT = int(os.environ.get("DW_FRONTEND_PORT", "5173"))

BACKEND_HEALTH = f"http://localhost:{BACKEND_PORT}/health"
FRONTEND_URL = f"http://localhost:{FRONTEND_PORT}"


class ServiceManager:
    """管理 DrawWork 三服务的启动/停止/健康检查"""

    def __init__(self, headless: bool = True):
        self.headless = headless
        self._backend: subprocess.Popen | None = None
        self._yjs: subprocess.Popen | None = None
        self._frontend: subprocess.Popen | None = None
        self._started = False

    # ─── port helpers ───────────────────────────────────────

    @staticmethod
    def _port_in_use(port: int) -> bool:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            return s.connect_ex(("localhost", port)) == 0

    def _wait_for_port(self, port: int, timeout: int = 30) -> bool:
        """Poll until port is accepting connections."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self._port_in_use(port):
                return True
            time.sleep(0.5)
        return False

    def _wait_for_http(self, url: str, timeout: int = 30) -> bool:
        """Poll until HTTP endpoint returns 2xx."""
        import urllib.request
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                resp = urllib.request.urlopen(url, timeout=2)
                if 200 <= resp.status < 400:
                    return True
            except Exception:
                pass
            time.sleep(0.5)
        return False

    # ─── process spawning (Windows) ─────────────────────────

    def _spawn(self, label: str, cwd: str, cmd: list[str], env_extra: dict | None = None) -> subprocess.Popen:
        """Spawn a subprocess with CREATE_NEW_CONSOLE when not headless."""
        env = os.environ.copy()
        if env_extra:
            env.update(env_extra)

        creationflags = 0
        if not self.headless and sys.platform == "win32":
            creationflags = subprocess.CREATE_NEW_CONSOLE

        proc = subprocess.Popen(
            cmd,
            cwd=str(ROOT_DIR / cwd),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=creationflags,
        )
        print(f"  [{label}] PID {proc.pid}  started in {cwd}")
        return proc

    # ─── start / stop ───────────────────────────────────────

    def start_all(self, reset_db: bool = False) -> bool:
        """Start backend → yjs → frontend in order, waiting for each to be ready."""

        if self._started:
            print("[ServiceManager] Already started, skipping.")
            return True

        print(f"[{datetime.now().strftime('%H:%M:%S')}] Starting DrawWork services...")

        # Kill any lingering port occupiers
        from .port_killer import kill_ports
        kill_ports(BACKEND_PORT, YJS_PORT, FRONTEND_PORT)

        # 1. Backend
        if reset_db:
            self._reset_database()

        self._backend = self._spawn(
            "Backend", "backend",
            [
                "node", "src/app.js",
            ],
            {
                "DATABASE_URL": "sqlite:./dev.db",
                "NODE_ENV": "development",
                "PORT": str(BACKEND_PORT),
                "REDIS_URL": os.environ.get("REDIS_URL", "redis://localhost:6379"),
            },
        )

        print(f"  Waiting for backend :{BACKEND_PORT} ...")
        if not self._wait_for_http(BACKEND_HEALTH, timeout=20):
            print("  [FAIL] Backend failed to start")
            return False
        print(f"  [OK] Backend ready")

        # 2. Yjs server
        self._yjs = self._spawn(
            "Yjs", "yjs-server",
            [
                "node", "src/server.js",
            ],
            {
                "SQLITE_PATH": str(ROOT_DIR / "backend" / "dev.db"),
                "API_URL": f"http://localhost:{BACKEND_PORT}",
            },
        )

        print(f"  Waiting for yjs-server :{YJS_PORT} ...")
        if not self._wait_for_port(YJS_PORT, timeout=15):
            print("  [WARN] Yjs server may have failed to start (port not open)")
        else:
            print(f"  [OK] Yjs server ready")

        # 3. Frontend
        self._frontend = self._spawn(
            "Frontend", "frontend",
            [
                "npx", "vite", "--port", str(FRONTEND_PORT), "--host",
            ],
        )

        print(f"  Waiting for frontend :{FRONTEND_PORT} ...")
        if not self._wait_for_port(FRONTEND_PORT, timeout=25):
            print("  [FAIL] Frontend failed to start")
            return False
        print(f"  [OK] Frontend ready")

        self._started = True
        print(f"[{datetime.now().strftime('%H:%M:%S')}] All services started.\n")
        return True

    def stop_all(self):
        """Stop all services gracefully, then force-kill any remaining port holders."""
        print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Stopping services...")

        for label, proc in [("Frontend", self._frontend), ("Yjs", self._yjs), ("Backend", self._backend)]:
            if proc is None:
                continue
            try:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                print(f"  [{label}] stopped (was PID {proc.pid})")
            except Exception as e:
                print(f"  [{label}] stop error: {e}")

        self._backend = self._yjs = self._frontend = None
        self._started = False

        # Cleanup lingering ports
        from .port_killer import kill_ports
        kill_ports(BACKEND_PORT, YJS_PORT, FRONTEND_PORT)

        print("  All services stopped.\n")

    def restart_frontend(self) -> bool:
        """Restart only the frontend (e.g., after bug fix)."""
        if self._frontend:
            try:
                self._frontend.terminate()
                self._frontend.wait(timeout=5)
            except Exception:
                pass

        self._frontend = self._spawn(
            "Frontend", "frontend",
            ["npx", "vite", "--port", str(FRONTEND_PORT), "--host"],
        )
        return self._wait_for_port(FRONTEND_PORT, timeout=25)

    def restart_backend(self) -> bool:
        """Restart only the backend (e.g., after bug fix)."""
        if self._backend:
            try:
                self._backend.terminate()
                self._backend.wait(timeout=5)
            except Exception:
                pass

        self._backend = self._spawn(
            "Backend", "backend",
            ["node", "src/app.js"],
            {
                "DATABASE_URL": "sqlite:./dev.db",
                "NODE_ENV": "development",
                "PORT": str(BACKEND_PORT),
                "REDIS_URL": os.environ.get("REDIS_URL", "redis://localhost:6379"),
            },
        )
        return self._wait_for_http(BACKEND_HEALTH, timeout=20)

    def is_healthy(self) -> bool:
        """Check if all services are responding."""
        ok = True
        if not self._port_in_use(BACKEND_PORT):
            print("  [FAIL] Backend not listening")
            ok = False
        if not self._port_in_use(YJS_PORT):
            print("  [WARN] Yjs server not listening")
            # Yjs is optional-continue
        if not self._port_in_use(FRONTEND_PORT):
            print("  [FAIL] Frontend not listening")
            ok = False
        return ok

    # ─── database ───────────────────────────────────────────

    def reset_database(self):
        """Delete dev.db and restart backend (triggers auto-migration)."""
        self._reset_database()

    def _reset_database(self):
        from .port_killer import kill_ports

        # Stop backend if running
        if self._backend:
            try:
                self._backend.terminate()
                self._backend.wait(timeout=5)
            except Exception:
                pass
            self._backend = None

        kill_ports(BACKEND_PORT)

        # Delete SQLite database
        db_path = ROOT_DIR / "backend" / "dev.db"
        if db_path.exists():
            db_path.unlink()
            print(f"  🗑️  Deleted {db_path}")

        # Don't delete uploads, node_modules, or other data
        print("  📦 Database reset complete (uploads preserved)")

    # ─── context manager ────────────────────────────────────

    def __enter__(self):
        self.start_all()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop_all()


# ─── quick test ─────────────────────────────────────────────
if __name__ == "__main__":
    mgr = ServiceManager(headless=False)
    try:
        mgr.start_all(reset_db=True)
        print("\nServices running. Press Enter to stop...")
        input()
    finally:
        mgr.stop_all()
