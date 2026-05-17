#!/usr/bin/env python3
"""
mcp2cli + chrome-devtools-mcp 测试 - V2
使用更健壮的流程
"""

import subprocess
import json
import sys
import time

def run_mcp_tool(tool_name, args, capture_json=True):
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

    print(f"\n> {tool_name}")

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

    if result.returncode != 0:
        print(f"  错误: {result.stderr[:200]}")
        return None

    output = result.stdout.strip()

    # 尝试解析 JSON
    if capture_json:
        try:
            # 有时候输出是 markdown 格式，尝试提取 JSON
            if output.startswith('{') or output.startswith('['):
                return json.loads(output)
            elif '"' in output or '{' in output:
                # 可能是混合输出，尝试找 JSON 部分
                start = output.find('{')
                if start != -1:
                    brace_count = 0
                    end = start
                    for i, c in enumerate(output[start:]):
                        if c == '{':
                            brace_count += 1
                        elif c == '}':
                            brace_count -= 1
                            if brace_count == 0:
                                end = start + i + 1
                                break
                    return json.loads(output[start:end])
        except json.JSONDecodeError:
            pass

    return output

def test_full_workflow():
    """完整工作流测试"""
    print("=" * 60)
    print("mcp2cli + chrome-devtools-mcp 测试")
    print("=" * 60)

    # 1. 导航到页面
    print("\n[1/5] 导航到 example.com")
    result = run_mcp_tool("navigate-page", {
        "url": "https://example.com",
        "type": "url",
        "timeout": "30000"
    })
    print(f"  结果: {str(result)[:200]}")

    # 等待加载
    time.sleep(3)

    # 2. 获取页面列表
    print("\n[2/5] 获取页面列表")
    pages = run_mcp_tool("list-pages", {})
    print(f"  页面: {pages}")

    # 3. 获取页面快照
    print("\n[3/5] 获取页面快照")
    snapshot = run_mcp_tool("take-snapshot", {})
    if snapshot:
        snapshot_str = str(snapshot)
        print(f"  快照预览: {snapshot_str[:300]}")

        # 分析快照内容
        if "Example Domain" in snapshot_str:
            print("  ✅ 页面内容验证成功 - 包含 'Example Domain'")

    # 4. 执行 JavaScript
    print("\n[4/5] 执行 JavaScript")
    js_result = run_mcp_tool("evaluate-script", {
        "script": "document.title"
    })
    print(f"  页面标题: {js_result}")

    if js_result and "Example Domain" in str(js_result):
        print("  ✅ JavaScript 执行成功")

    # 5. 截图
    print("\n[5/5] 截图")
    screenshot = run_mcp_tool("take-screenshot", {
        "format": "png"
    })
    if screenshot:
        print(f"  ✅ 截图成功 (base64 length: {len(str(screenshot))})")

        # 保存截图
        try:
            import base64
            if isinstance(screenshot, dict) and "data" in screenshot:
                img_data = base64.b64decode(screenshot["data"])
            elif isinstance(screenshot, str):
                img_data = base64.b64decode(screenshot)
            else:
                img_data = None

            if img_data:
                with open("test-mcp-screenshot.png", "wb") as f:
                    f.write(img_data)
                print(f"  ✅ 截图已保存: test-mcp-screenshot.png ({len(img_data)} bytes)")
        except Exception as e:
            print(f"  ⚠️  保存截图失败: {e}")

    print("\n" + "=" * 60)
    print("测试完成!")
    print("=" * 60)

    return True

if __name__ == "__main__":
    try:
        test_full_workflow()
    except Exception as e:
        print(f"\n[错误] {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
