"""
Unified Reporter — JSON + HTML 测试报告生成
"""
import json
from pathlib import Path
from datetime import datetime
from typing import Any

RESULTS_DIR = Path(__file__).resolve().parent.parent / "results" / "reports"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)


class TestReporter:
    """统一测试报告生成器"""

    def __init__(self, run_id: str | None = None):
        self.run_id = run_id or datetime.now().strftime("%Y%m%d_%H%M%S")
        self.results: list[dict] = []
        self._start_time = datetime.now()

    def add_result(self, test_id: str, test_name: str, passed: bool,
                   layer: str = "", duration_sec: float = 0,
                   details: dict | None = None, screenshot: str = "",
                   error: str = ""):
        """添加一条测试结果"""
        self.results.append({
            "test_id": test_id,
            "test_name": test_name,
            "passed": passed,
            "layer": layer,
            "duration_sec": round(duration_sec, 2),
            "details": details or {},
            "screenshot": screenshot,
            "error": error,
        })

    @property
    def summary(self) -> dict:
        """生成汇总统计"""
        total = len(self.results)
        passed = sum(1 for r in self.results if r["passed"])
        failed = total - passed
        by_layer = {}
        for r in self.results:
            layer = r["layer"] or "unknown"
            if layer not in by_layer:
                by_layer[layer] = {"total": 0, "passed": 0, "failed": 0}
            by_layer[layer]["total"] += 1
            if r["passed"]:
                by_layer[layer]["passed"] += 1
            else:
                by_layer[layer]["failed"] += 1

        return {
            "run_id": self.run_id,
            "started_at": self._start_time.isoformat(),
            "finished_at": datetime.now().isoformat(),
            "total": total,
            "passed": passed,
            "failed": failed,
            "pass_rate": round(passed / total * 100, 1) if total > 0 else 0,
            "by_layer": by_layer,
        }

    # ─── outputs ────────────────────────────────────────────

    def save_json(self) -> Path:
        """保存 JSON 报告"""
        path = RESULTS_DIR / f"report_{self.run_id}.json"
        data = {
            "summary": self.summary,
            "results": self.results,
        }
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"  📊 JSON report: {path}")
        return path

    def save_html(self) -> Path:
        """保存 HTML 报告 (self-contained)"""
        path = RESULTS_DIR / f"report_{self.run_id}.html"
        s = self.summary
        pass_pct = s["pass_rate"]

        # Status color
        if pass_pct == 100:
            status_color = "#22c55e"
            status_icon = "✅"
        elif pass_pct >= 80:
            status_color = "#f59e0b"
            status_icon = "⚠️"
        else:
            status_color = "#ef4444"
            status_icon = "❌"

        rows = ""
        for r in self.results:
            icon = "✅" if r["passed"] else "❌"
            color = "#22c55e" if r["passed"] else "#ef4444"
            layer_badge = f'<span style="background:#3b82f6;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px">{r["layer"]}</span>' if r["layer"] else ""
            err_html = f'<div style="color:#ef4444;font-size:13px;margin-top:4px">{r["error"]}</div>' if r["error"] else ""
            screenshot_html = f'<a href="{r["screenshot"]}" target="_blank"><img src="{r["screenshot"]}" style="max-width:300px;max-height:200px;border:1px solid #ddd;margin-top:4px"></a>' if r["screenshot"] else ""

            rows += f"""
            <tr style="background:{'#f0fdf4' if r['passed'] else '#fef2f2'}">
                <td>{icon} {r['test_id']}</td>
                <td>{r['test_name']}</td>
                <td>{layer_badge}</td>
                <td style="color:{color};font-weight:bold">{'PASS' if r['passed'] else 'FAIL'}</td>
                <td>{r['duration_sec']}s</td>
                <td>{err_html}{screenshot_html}</td>
            </tr>"""

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DrawWork Test Report — {self.run_id}</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#1e293b;padding:24px}}
.container{{max-width:1200px;margin:0 auto}}
h1{{font-size:24px;margin-bottom:8px}}
.summary{{display:flex;gap:16px;margin:16px 0;flex-wrap:wrap}}
.card{{background:#fff;border-radius:8px;padding:16px 24px;box-shadow:0 1px 3px rgba(0,0,0,.1);min-width:140px}}
.card .label{{font-size:12px;color:#64748b;text-transform:uppercase;margin-bottom:4px}}
.card .value{{font-size:28px;font-weight:700}}
.pass-rate{{display:flex;align-items:center;gap:12px;background:#fff;border-radius:8px;padding:16px 24px;box-shadow:0 1px 3px rgba(0,0,0,.1);margin:16px 0}}
.pass-rate .big{{font-size:48px;font-weight:800;color:{status_color}}}
table{{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)}}
th{{background:#f1f5f9;padding:12px 16px;text-align:left;font-size:13px;color:#64748b;text-transform:uppercase}}
td{{padding:10px 16px;font-size:14px;border-top:1px solid #e2e8f0}}
tr:hover td{{background:#f8fafc}}
.bar{{height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;margin:8px 0}}
.bar-fill{{height:100%;background:{status_color};border-radius:4px;transition:width .3s}}
.layer-summary{{display:flex;gap:12px;flex-wrap:wrap;margin:8px 0}}
</style>
</head>
<body>
<div class="container">
<h1>{status_icon} DrawWork Test Report</h1>
<p style="color:#64748b">Run: {s['run_id']} | {s['started_at']} → {s['finished_at']}</p>

<div class="pass-rate">
    <div class="big">{pass_pct}%</div>
    <div>
        <div style="font-weight:600">Pass Rate</div>
        <div style="color:#64748b;font-size:14px">{s['passed']}/{s['total']} tests passing</div>
    </div>
</div>

<div class="summary">
    <div class="card"><div class="label">Total</div><div class="value" style="color:#3b82f6">{s['total']}</div></div>
    <div class="card"><div class="label">Passed</div><div class="value" style="color:#22c55e">{s['passed']}</div></div>
    <div class="card"><div class="label">Failed</div><div class="value" style="color:#ef4444">{s['failed']}</div></div>
</div>

<div class="bar"><div class="bar-fill" style="width:{pass_pct}%"></div></div>

<h2 style="margin:24px 0 12px">Results</h2>
<table>
<thead><tr><th>ID</th><th>Name</th><th>Layer</th><th>Status</th><th>Duration</th><th>Details</th></tr></thead>
<tbody>{rows}</tbody>
</table>

<p style="color:#94a3b8;font-size:12px;margin-top:24px;text-align:center">Generated by DrawWork Test Framework</p>
</div>
</body>
</html>"""

        path.write_text(html, encoding="utf-8")
        print(f"  📄 HTML report: {path}")
        return path

    def print_terminal_summary(self):
        """打印终端摘要"""
        s = self.summary
        print("\n" + "=" * 60)
        print(f"  TEST REPORT — {s['run_id']}")
        print("=" * 60)
        print(f"  Total:  {s['total']}  |  ✅ Passed: {s['passed']}  |  ❌ Failed: {s['failed']}  |  Rate: {s['pass_rate']}%")
        for layer, stats in s.get("by_layer", {}).items():
            print(f"  [{layer}] {stats['passed']}/{stats['total']} passed")
        print("=" * 60)

        failed = [r for r in self.results if not r["passed"]]
        if failed:
            print(f"\n  Failed tests ({len(failed)}):")
            for r in failed:
                print(f"    ❌ {r['test_id']}: {r['test_name']}")
                if r["error"]:
                    print(f"       {r['error'][:120]}")
        print()


# ─── quick test ─────────────────────────────────────────────
if __name__ == "__main__":
    reporter = TestReporter(run_id="demo")
    reporter.add_result("TC-001", "Homepage loads", True, layer="Level1", duration_sec=1.2)
    reporter.add_result("TC-002", "Login flow", False, layer="Level1", duration_sec=3.5, error="Timeout waiting for selector 'button[type=submit]'")
    reporter.add_result("TC-003", "Draw rectangle", True, layer="Level2", duration_sec=5.1)
    reporter.add_result("TC-004", "MindMap node edit", False, layer="Level2", duration_sec=2.8, error="Element not found: text=思维导图")
    reporter.save_json()
    reporter.save_html()
    reporter.print_terminal_summary()
