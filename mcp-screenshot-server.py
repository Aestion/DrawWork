#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Screenshot & Desktop Control MCP Server
为 Claude/OpenClaw 提供截图和桌面自动化能力

运行方式:
    python mcp-screenshot-server.py

或作为 MCP Server:
    在 .mcp.json 中配置:
    {
      "mcpServers": {
        "desktop": {
          "command": "python",
          "args": ["mcp-screenshot-server.py"]
        }
      }
    }
"""

import asyncio
import base64
import io
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import pyautogui
    from mcp.server.models import InitializationOptions
    from mcp.server import NotificationOptions, Server
    from mcp.server.stdio import stdio_server
    from mcp.types import (
        Resource,
        Tool,
        TextContent,
        ImageContent,
        EmbeddedResource,
        LoggingLevel
    )
    from pydantic import BaseModel, Field
except ImportError:
    print("缺少依赖，正在安装...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "mcp", "pyautogui", "pillow", "pydantic"])
    print("请重新运行脚本")
    sys.exit(1)

# 配置
pyautogui.FAILSAFE = True  # 鼠标移到左上角退出

# 创建 MCP Server
server = Server("desktop-control")


class ScreenshotInput(BaseModel):
    """截图输入参数"""
    filename: Optional[str] = Field(
        default=None,
        description="保存截图的文件名(可选)，如不指定则返回base64"
    )
    region: Optional[tuple] = Field(
        default=None,
        description="截图区域 (left, top, width, height)，None表示全屏"
    )


class MoveMouseInput(BaseModel):
    """移动鼠标输入参数"""
    x: int = Field(description="目标 X 坐标")
    y: int = Field(description="目标 Y 坐标")
    duration: float = Field(
        default=0.5,
        description="移动持续时间(秒)，越大移动越慢"
    )


class ClickInput(BaseModel):
    """点击输入参数"""
    button: str = Field(
        default="left",
        description="鼠标按钮: left, right, middle"
    )
    clicks: int = Field(
        default=1,
        description="点击次数，2表示双击"
    )


class TypeTextInput(BaseModel):
    """输入文本输入参数"""
    text: str = Field(description="要输入的文本")
    interval: float = Field(
        default=0.01,
        description="字符间隔(秒)，越大打字越慢"
    )


class DragInput(BaseModel):
    """拖拽输入参数"""
    dx: int = Field(description="X方向移动距离")
    dy: int = Field(description="Y方向移动距离")
    duration: float = Field(default=0.5, description="拖拽持续时间")


class KeyInput(BaseModel):
    """按键输入参数"""
    key: str = Field(description="按键名称，如 enter, tab, escape, f1 等")


@server.list_tools()
async def handle_list_tools() -> List[Tool]:
    """列出可用工具"""
    return [
        Tool(
            name="screenshot",
            description="截取屏幕截图，可保存为文件或返回base64编码的图片",
            inputSchema=ScreenshotInput.model_json_schema(),
            annotations={
                "readOnlyHint": True,
                "idempotentHint": True
            }
        ),
        Tool(
            name="move_mouse",
            description="移动鼠标到指定屏幕坐标，可看到鼠标移动动画",
            inputSchema=MoveMouseInput.model_json_schema(),
            annotations={
                "readOnlyHint": True,
                "idempotentHint": True
            }
        ),
        Tool(
            name="click",
            description="在当前鼠标位置点击",
            inputSchema=ClickInput.model_json_schema(),
            annotations={
                "destructiveHint": False,
                "idempotentHint": False
            }
        ),
        Tool(
            name="type_text",
            description="在当前焦点位置输入文本，像真人一样逐字输入",
            inputSchema=TypeTextInput.model_json_schema(),
            annotations={
                "destructiveHint": True,
                "idempotentHint": False
            }
        ),
        Tool(
            name="drag",
            description="从当前位置拖拽到相对位置",
            inputSchema=DragInput.model_json_schema(),
            annotations={
                "destructiveHint": True,
                "idempotentHint": False
            }
        ),
        Tool(
            name="press_key",
            description="按下键盘按键",
            inputSchema=KeyInput.model_json_schema(),
            annotations={
                "destructiveHint": True,
                "idempotentHint": False
            }
        ),
        Tool(
            name="get_screen_size",
            description="获取屏幕分辨率",
            inputSchema={"type": "object", "properties": {}},
            annotations={
                "readOnlyHint": True,
                "idempotentHint": True
            }
        ),
        Tool(
            name="get_mouse_position",
            description="获取当前鼠标位置",
            inputSchema={"type": "object", "properties": {}},
            annotations={
                "readOnlyHint": True,
                "idempotentHint": True
            }
        ),
    ]


@server.call_tool()
async def handle_call_tool(name: str, arguments: Dict[str, Any] | None) -> List:
    """处理工具调用"""
    arguments = arguments or {}

    if name == "screenshot":
        try:
            # 截图
            screenshot = pyautogui.screenshot(region=arguments.get("region"))

            # 转换为 base64
            buffered = io.BytesIO()
            screenshot.save(buffered, format="PNG")
            img_base64 = base64.b64encode(buffered.getvalue()).decode()

            result_text = f"截图成功！分辨率: {screenshot.size}"

            # 如果指定了文件名，保存到文件
            if arguments.get("filename"):
                filepath = Path(arguments["filename"])
                screenshot.save(filepath)
                result_text += f"\n已保存到: {filepath.absolute()}"

            return [
                TextContent(type="text", text=result_text),
                ImageContent(type="image", data=img_base64, mimeType="image/png")
            ]
        except Exception as e:
            return [TextContent(type="text", text=f"截图失败: {str(e)}")]

    elif name == "move_mouse":
        try:
            x = arguments.get("x", 0)
            y = arguments.get("y", 0)
            duration = arguments.get("duration", 0.5)
            pyautogui.moveTo(x, y, duration=duration)
            return [TextContent(type="text", text=f"鼠标已移动到 ({x}, {y})")]
        except Exception as e:
            return [TextContent(type="text", text=f"移动失败: {str(e)}")]

    elif name == "click":
        try:
            button = arguments.get("button", "left")
            clicks = arguments.get("clicks", 1)
            pyautogui.click(button=button, clicks=clicks)
            action = "双击" if clicks == 2 else f"{button}键点击"
            return [TextContent(type="text", text=f"{action}完成")]
        except Exception as e:
            return [TextContent(type="text", text=f"点击失败: {str(e)}")]

    elif name == "type_text":
        try:
            text = arguments.get("text", "")
            interval = arguments.get("interval", 0.01)
            pyautogui.typewrite(text, interval=interval)
            return [TextContent(type="text", text=f"已输入: {text[:50]}{'...' if len(text) > 50 else ''}")]
        except Exception as e:
            return [TextContent(type="text", text=f"输入失败: {str(e)}")]

    elif name == "drag":
        try:
            dx = arguments.get("dx", 0)
            dy = arguments.get("dy", 0)
            duration = arguments.get("duration", 0.5)
            pyautogui.moveRel(dx, dy, duration=duration)
            return [TextContent(type="text", text=f"拖拽到相对位置 ({dx}, {dy})")]
        except Exception as e:
            return [TextContent(type="text", text=f"拖拽失败: {str(e)}")]

    elif name == "press_key":
        try:
            key = arguments.get("key", "")
            pyautogui.press(key)
            return [TextContent(type="text", text=f"按下 {key} 键")]
        except Exception as e:
            return [TextContent(type="text", text=f"按键失败: {str(e)}")]

    elif name == "get_screen_size":
        try:
            width, height = pyautogui.size()
            return [TextContent(type="text", text=f"屏幕分辨率: {width} x {height}")]
        except Exception as e:
            return [TextContent(type="text", text=f"获取失败: {str(e)}")]

    elif name == "get_mouse_position":
        try:
            x, y = pyautogui.position()
            return [TextContent(type="text", text=f"当前鼠标位置: ({x}, {y})")]
        except Exception as e:
            return [TextContent(type="text", text=f"获取失败: {str(e)}")]

    else:
        return [TextContent(type="text", text=f"未知工具: {name}")]


async def main():
    """主函数"""
    # 检查依赖
    try:
        import mcp
        import pyautogui
        from PIL import Image
        print("✅ 所有依赖已安装", file=sys.stderr)
    except ImportError as e:
        print(f"❌ 缺少依赖: {e}", file=sys.stderr)
        print("请运行: pip install mcp pyautogui pillow", file=sys.stderr)
        sys.exit(1)

    print("🖥️  Desktop Control MCP Server 启动中...", file=sys.stderr)
    print("📸 可用工具: screenshot, move_mouse, click, type_text, drag, press_key, get_screen_size, get_mouse_position", file=sys.stderr)
    print("⚠️  提示: 快速移动鼠标到屏幕左上角可紧急停止", file=sys.stderr)
    print("=" * 50, file=sys.stderr)

    # 运行服务器 (stdio 模式)
    async with stdio_server(server) as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="desktop-control",
                server_version="1.0.0",
                capabilities=server.get_capabilities()
            )
        )


if __name__ == "__main__":
    asyncio.run(main())
