"""
port-killer: 强制释放指定端口
用于服务启动前清理残留进程。
"""
import subprocess
import sys


def kill_ports(*ports: int, verbose: bool = True):
    """
    Kill all processes listening on the given TCP ports (Windows).

    Uses `netstat -ano` to find PIDs, then `taskkill /F` to force-stop them.
    """
    for port in ports:
        pids = _find_pids_by_port(port)
        if not pids:
            continue

        for pid in pids:
            try:
                subprocess.run(
                    ["taskkill", "/F", "/PID", str(pid)],
                    capture_output=True,
                    timeout=5,
                )
                if verbose:
                    print(f"  Killed PID {pid} (port {port})")
            except subprocess.TimeoutExpired:
                print(f"  Timeout killing PID {pid} on port {port}")
            except Exception as e:
                print(f"  Error killing PID {pid} on port {port}: {e}")


def _find_pids_by_port(port: int) -> list[int]:
    """Return list of PIDs listening on the given TCP port."""
    try:
        output = subprocess.run(
            ["netstat", "-ano", "-p", "tcp"],
            capture_output=True,
            text=True,
            timeout=10,
        ).stdout
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return []

    pids = []
    for line in output.splitlines():
        parts = line.strip().split()
        if len(parts) >= 5 and f":{port}" in parts[1]:
            pid_str = parts[-1]
            if pid_str.isdigit():
                pids.append(int(pid_str))
    return pids


# ─── quick test ─────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) > 1:
        ports = [int(p) for p in sys.argv[1:]]
    else:
        ports = [3000, 3001, 5173]

    print(f"Killing ports {ports}...")
    kill_ports(*ports)
    print("Done.")
