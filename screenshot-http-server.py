#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Screenshot HTTP API Server
通过 HTTP 暴露截图和桌面控制功能
VSCode 扩展可以通过 curl 调用

运行:
    python screenshot-http-server.py

然后可以通过 HTTP 调用:
    curl http://localhost:8765/screenshot
    curl -X POST http://localhost:8765/move_mouse -d "{\"x\":100,\"y\":200}"
"""

import json
import base64
import io
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from PIL import Image
import pyautogui
import threading
import time

pyautogui.FAILSAFE = True

PORT = 8765


class ScreenshotHandler(BaseHTTPRequestHandler):
    """HTTP 请求处理器"""

    def log_message(self, format, *args):
        """简化日志"""
        print(f"[{time.strftime('%H:%M:%S')}] {args[0]}")

    def _send_json(self, data, status=200):
        """发送 JSON 响应"""
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def _send_image(self, image_data, filename="screenshot.png"):
        """发送图片响应"""
        self.send_response(200)
        self.send_header('Content-Type', 'image/png')
        self.send_header('Content-Disposition', f'inline; filename="{filename}"')
        self.end_headers()
        self.wfile.write(image_data)

    def do_GET(self):
        """处理 GET 请求"""
        path = self.path.split('?')[0]

        if path == '/screenshot':
            # 截图并返回图片
            try:
                screenshot = pyautogui.screenshot()
                buffered = io.BytesIO()
                screenshot.save(buffered, format="PNG")
                self._send_image(buffered.getvalue())
            except Exception as e:
                self._send_json({"error": str(e)}, 500)

        elif path == '/screen_size':
            # 获取屏幕尺寸
            width, height = pyautogui.size()
            self._send_json({"width": width, "height": height})

        elif path == '/mouse_position':
            # 获取鼠标位置
            x, y = pyautogui.position()
            self._send_json({"x": x, "y": y})

        elif path == '/':
            # API 文档
            self._send_json({
                "name": "Screenshot HTTP API",
                "version": "1.0.0",
                "endpoints": {
                    "GET /screenshot": "截取全屏并返回 PNG 图片",
                    "GET /screen_size": "获取屏幕分辨率",
                    "GET /mouse_position": "获取当前鼠标位置",
                    "POST /move_mouse": "移动鼠标，参数: {x, y, duration}",
                    "POST /click": "点击，参数: {button, clicks}",
                    "POST /type_text": "输入文本，参数: {text, interval}",
                    "POST /press_key": "按键，参数: {key}",
                    "POST /drag": "拖拽，参数: {dx, dy, duration}"
                }
            })

        else:
            self._send_json({"error": "Not found"}, 404)

    def do_POST(self):
        """处理 POST 请求"""
        path = self.path
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode()

        try:
            params = json.loads(post_data) if post_data else {}
        except:
            params = {}

        try:
            if path == '/move_mouse':
                x = params.get('x', 0)
                y = params.get('y', 0)
                duration = params.get('duration', 0.5)
                pyautogui.moveTo(x, y, duration=duration)
                self._send_json({"success": True, "action": "move_mouse", "x": x, "y": y})

            elif path == '/click':
                button = params.get('button', 'left')
                clicks = params.get('clicks', 1)
                pyautogui.click(button=button, clicks=clicks)
                self._send_json({"success": True, "action": "click", "button": button, "clicks": clicks})

            elif path == '/type_text':
                text = params.get('text', '')
                interval = params.get('interval', 0.01)
                pyautogui.typewrite(text, interval=interval)
                self._send_json({"success": True, "action": "type_text", "text": text[:20] + '...' if len(text) > 20 else text})

            elif path == '/press_key':
                key = params.get('key', '')
                pyautogui.press(key)
                self._send_json({"success": True, "action": "press_key", "key": key})

            elif path == '/drag':
                dx = params.get('dx', 0)
                dy = params.get('dy', 0)
                duration = params.get('duration', 0.5)
                pyautogui.moveRel(dx, dy, duration=duration)
                self._send_json({"success": True, "action": "drag", "dx": dx, "dy": dy})

            else:
                self._send_json({"error": "Unknown endpoint"}, 404)

        except Exception as e:
            self._send_json({"error": str(e)}, 500)

    def do_OPTIONS(self):
        """处理 CORS 预检"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()


def run_server():
    """启动服务器"""
    server = HTTPServer(('localhost', PORT), ScreenshotHandler)
    print(f"🖥️  Screenshot HTTP API Server 启动!")
    print(f"📍 地址: http://localhost:{PORT}")
    print(f"\n可用接口:")
    print(f"  GET  http://localhost:{PORT}/screenshot      - 截图")
    print(f"  GET  http://localhost:{PORT}/screen_size     - 屏幕尺寸")
    print(f"  GET  http://localhost:{PORT}/mouse_position  - 鼠标位置")
    print(f"  POST http://localhost:{PORT}/move_mouse      - 移动鼠标")
    print(f"  POST http://localhost:{PORT}/click           - 点击")
    print(f"  POST http://localhost:{PORT}/type_text       - 输入文本")
    print(f"  POST http://localhost:{PORT}/press_key       - 按键")
    print(f"  POST http://localhost:{PORT}/drag            - 拖拽")
    print(f"\n⚠️  快速移动鼠标到屏幕左上角可紧急停止")
    print("=" * 50)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n\n🛑 服务器停止")
        server.shutdown()


if __name__ == "__main__":
    run_server()
