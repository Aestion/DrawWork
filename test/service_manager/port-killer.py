"""
Port Killer — 清理被占用的端口 (Windows)
"""
import subprocess
import sys


def kill_ports(*ports: int) -> None:
    """Kill all processes occupying the given ports (Windows only)."""
    if sys.platform != "win32":
        return

    for port in ports:
        try:
            # Find PIDs listening on this port
            result = subprocess.run(
                ["cmd", "/c", f"netstat -ano | findstr :{port} | findstr LISTENING"],
                capture_output=True, text=True, timeout=5
            )
            lines = result.stdout.strip().split("\n")
            killed = set()
            for line in lines:
                if not line.strip():
                    continue
                parts = line.strip().split()
                if len(parts) < 5:
                    continue
                pid = parts[-1]
                if pid.isdigit() and pid not in killed:
                    subprocess.run(
                        ["taskkill", "/PID", pid, "/F", "/T"],
                        capture_output=True, timeout=5
                    )
                    killed.add(pid)
                    print(f"  🔪 Killed PID {pid} on port {port}")
        except Exception:
            pass


if __name__ == "__main__":
    kill_ports(3000, 3001, 5173)
