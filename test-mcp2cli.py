#!/usr/bin/env python3
"""
测试 mcp2cli 与 chrome-devtools-mcp 的集成
运行两个测试:
1. 导航到 DrawWork 首页并截图
2. 获取页面快照并分析元素
"""

import subprocess
import json
import sys

def run_mcp_tool(tool_name, args):
    """运行 MCP 工具并返回结果"""
    cmd = [
        "mcp2cli",
        "--mcp-stdio", "chrome-devtools-mcp --headless --no-usage-statistics --viewport 1280x720"
    ]
    cmd.append(tool_name)

    for key, value in args.items():
        cmd.append(f"--{key}")
        if isinstance(value, bool):
            pass
        elif isinstance(value, (list, dict)):
            cmd.append(json.dumps(value))
        else:
            cmd.append(str(value))

    print(f"\n[执行] {' '.join(cmd)}")

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

    if result.returncode != 0:
        print(f"[错误] {result.stderr}")
        return None

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return result.stdout

def test_1_navigate_and_screenshot():
    """测试1: 导航到首页并截图"""
    print("=" * 60)
    print("测试1: 导航到 DrawWork 首页并截图")
    print("=" * 60)

    # 导航到页面
    result = run_mcp_tool("navigate-page", {"url": "http://localhost:5173", "type": "url"})
    print(f"[导航结果] {result}")

    # 等待页面加载
    import time
    time.sleep(2)

    # 截图
    screenshot = run_mcp_tool("take-screenshot", {"format": "png"})
    if screenshot:
        # 保存截图
        if isinstance(screenshot, dict) and "data" in screenshot:
            import base64
            img_data = base64.b64decode(screenshot["data"])
            with open("test-mcp-screenshot.png", "wb") as f:
                f.write(img_data)
            print("[截图已保存] test-mcp-screenshot.png")
        else:
            print(f"[截图结果] {screenshot[:200] if isinstance(screenshot, str) else screenshot}")

    return True

def test_2_page_snapshot():
    """测试2: 获取页面快照并分析"""
    print("\n" + "=" * 60)
    print("测试2: 获取页面快照并分析")
    print("=" * 60)

    # 获取页面快照
    snapshot = run_mcp_tool("take-snapshot", {})
    if snapshot:
        if isinstance(snapshot, dict):
            print(f"[快照类型] {type(snapshot)}")
            print(f"[快照预览] {json.dumps(snapshot, indent=2)[:500]}")
        else:
            print(f"[快照结果] {snapshot[:500] if isinstance(snapshot, str) else snapshot}")

    # 获取控制台消息
    console = run_mcp_tool("list-console-messages", {})
    if console:
        print(f"[控制台消息] {console}")

    return True

def test_3_performance_audit():
    """测试3: Lighthouse 性能审计"""
    print("\n" + "=" * 60)
    print("测试3: Lighthouse 可访问性审计")
    print("=" * 60)

    # 运行 Lighthouse 审计
    audit = run_mcp_tool("lighthouse-audit", {})
    if audit:
        print(f"[审计结果] {json.dumps(audit, indent=2)[:1000]}")

    return True

if __name__ == "__main__":
    print("mcp2cli + chrome-devtools-mcp 测试")
    print(f"目标: http://localhost:5173 (DrawWork)")

    try:
        # 运行测试
        test_1_navigate_and_screenshot()
        test_2_page_snapshot()
        test_3_performance_audit()

        print("\n" + "=" * 60)
        print("所有测试完成!")
        print("=" * 60)

    except Exception as e:
        print(f"\n[测试失败] {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
