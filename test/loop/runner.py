"""
Loop Runner — AI维修循环主控制器

用法:
    python test/loop/runner.py

流程:
    1. 重置 DB → 启动服务
    2. 依次跑 API → Level 1 → Level 2 → Mixed
    3. 收集失败 → 写入 fix-request.md
    4. OpenClaw 检测 fix-request.md → 修复 → 删除该文件
    5. Runner 检测文件删除 → 重跑
    6. 全通过 → 生成最终报告
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from datetime import datetime

TEST_ROOT = Path(__file__).resolve().parent.parent
RESULTS_DIR = TEST_ROOT / "results" / "reports"
FIX_REQUEST = TEST_ROOT / "results" / "fix-request.md"
FAILURES_JSON = TEST_ROOT / "results" / "failures.json"
LOCK_FILE = TEST_ROOT / "results" / ".loop-running"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

MAX_RETRIES = 5       # 单个 case 重试上限
MAX_LOOP_TIME = 30 * 60  # 总循环超时 (30分钟)
POLL_INTERVAL = 5        # 检查 fix-request.md 是否被删除的轮询间隔(秒)

RUN_ID = datetime.now().strftime("%Y%m%d_%H%M%S")


class LoopRunner:
    def __init__(self):
        self.retry_counts = {}  # {test_name: consecutive_failures}
        self.manual_triage = []  # [test_name, ...]
        self.loop_start = time.time()
        self.pass_count = 0
        self.fail_count = 0
        self.all_results = []

    # ─── step executors ─────────────────────────────────────

    def _run_step(self, label: str, cmd: list[str]) -> list[dict]:
        """Run a test command and parse results. Returns list of test results."""
        print(f"\n{'='*60}")
        print(f"  [{label}]")
        print(f"  Command: {' '.join(cmd)}")
        print(f"{'='*60}")

        proc = subprocess.run(cmd, cwd=str(TEST_ROOT), capture_output=True, text=True, timeout=600)
        failures = []

        if proc.returncode != 0:
            # Parse output for failed tests
            for line in proc.stdout.split("\n") + proc.stderr.split("\n"):
                line = line.strip()
                if "FAILED" in line or "fail" in line.lower():
                    if "::" in line:
                        test_name = line.split("::")[-1].split()[0]
                        failures.append({"test": test_name, "label": label, "line": line})

        print(f"  Exit: {proc.returncode} | Failures: {len(failures)}")
        return failures

    # ─── main loop ──────────────────────────────────────────

    def run(self):
        # Write lock file
        LOCK_FILE.write_text(RUN_ID)

        # Reset DB
        print("[Loop] Resetting database...")
        from service_manager.manager import ServiceManager
        mgr = ServiceManager(headless=True)
        mgr.start_all(reset_db=True)

        iteration = 0

        while True:
            iteration += 1
            print(f"\n{'#'*60}")
            print(f"#  LOOP ITERATION {iteration}")
            print(f"{'#'*60}")

            all_pass = True

            # ── Step 1: API tests ──
            failures = self._run_step("API", [
                sys.executable, "-m", "pytest", "api/", "-v", "--tb=short",
                f"--html={RESULTS_DIR}/api_{RUN_ID}_{iteration}.html",
                "--self-contained-html",
            ])
            if failures:
                all_pass = False
                self._handle_failures("API", failures)

            # ── Step 2: Level 1 (Playwright) ──
            failures = self._run_step("Level1", [
                "npx", "playwright", "test",
                "--config", "level1-playwright/playwright.config.js",
            ])
            if failures:
                all_pass = False
                self._handle_failures("Level1", failures)

            # ── Step 3: Level 2 (PyAutoGUI) ──
            failures = self._run_step("Level2", [
                sys.executable, "-m", "pytest", "level2-pyautogui/", "-v", "--tb=short",
                f"--html={RESULTS_DIR}/l2_{RUN_ID}_{iteration}.html",
                "--self-contained-html",
            ])
            if failures:
                all_pass = False
                self._handle_failures("Level2", failures)

            # ── Step 4: Mixed ──
            failures = self._run_step("Mixed", [
                sys.executable, "-m", "pytest", "mixed/", "-v", "--tb=short",
                f"--html={RESULTS_DIR}/mixed_{RUN_ID}_{iteration}.html",
                "--self-contained-html",
            ])
            if failures:
                all_pass = False
                self._handle_failures("Mixed", failures)

            # ── Check termination ──
            if all_pass:
                print(f"\n{'='*60}")
                print(f"  ✅ ALL TESTS PASSED after {iteration} iterations!")
                print(f"{'='*60}")
                self._generate_final_report(passed=True)
                break

            if self.manual_triage:
                print(f"\n{'='*60}")
                print(f"  ❌ MANUAL TRIAGE REQUIRED for: {', '.join(self.manual_triage)}")
                print(f"{'='*60}")
                self._generate_final_report(passed=False)
                break

            if time.time() - self.loop_start > MAX_LOOP_TIME:
                print(f"\n  ⏰ Timeout after {MAX_LOOP_TIME}s")
                self._generate_final_report(passed=False)
                break

            # ── Write fix request, then wait for AI ──
            self._write_fix_request(iteration)
            print(f"\n  ⏳ Waiting for AI to fix... (polling every {POLL_INTERVAL}s)")
            while FIX_REQUEST.exists():
                time.sleep(POLL_INTERVAL)
            print(f"  🔄 Fix completed, retrying...")

        # Cleanup
        mgr.stop_all()
        LOCK_FILE.unlink(missing_ok=True)

    # ─── failure handling ───────────────────────────────────

    def _handle_failures(self, label: str, failures: list[dict]):
        for f in failures:
            name = f["test"]
            self.retry_counts[name] = self.retry_counts.get(name, 0) + 1
            if self.retry_counts[name] >= MAX_RETRIES:
                self.manual_triage.append(name)
                print(f"  🚫 {name}: marked manual triage (retries={self.retry_counts[name]})")

    def _write_fix_request(self, iteration: int):
        """Write fix-request.md for OpenClaw to consume."""
        lines = [
            f"# Fix Request — Loop Iteration {iteration}",
            f"",
            f"**Time:** {datetime.now().isoformat()}",
            f"**Retries:** {json.dumps(self.retry_counts, indent=2)}",
            f"**Manual Triage:** {json.dumps(self.manual_triage)}",
            f"",
            f"## Instructions",
            f"",
            f"1. Read the failure details from `test/results/failures.json` and the HTML reports",
            f"2. Fix the root cause (source code or test script)",
            f"3. Run the failing test locally to verify",
            f"4. Delete this file (`test/results/fix-request.md`) to trigger a re-run",
            f"",
            f"---",
            f"*Auto-generated by loop/runner.py*",
        ]
        FIX_REQUEST.write_text("\n".join(lines), encoding="utf-8")
        print(f"  📝 Fix request written: {FIX_REQUEST}")

    def _generate_final_report(self, passed: bool):
        """Generate final test report."""
        from shared.report import TestReporter
        reporter = TestReporter(run_id=RUN_ID)
        reporter.add_result("LOOP-FINAL", "Complete Test Suite", passed,
                            layer="ALL", details={"iterations": self.retry_counts})
        reporter.save_json()
        reporter.save_html()
        reporter.print_terminal_summary()
        print(f"\n  📊 Reports: {RESULTS_DIR}")


if __name__ == "__main__":
    runner = LoopRunner()
    runner.run()
