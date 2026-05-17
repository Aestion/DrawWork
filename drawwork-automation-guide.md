# DrawWork 自动化测试指南

## 快速开始

### 第 1 步：启动环境
双击运行 `start-automation-env.bat`

这会启动：
- DrawWork 后端 (localhost:3000)
- Yjs 协作服务器 (localhost:3001)
- DrawWork 前端 (localhost:5173)
- 截图控制 API (localhost:8765)
- Chrome 浏览器 (自动打开 http://localhost:5173)

### 第 2 步：告诉我准备好了

等所有窗口都打开后，告诉我：**"环境准备好了"**

### 第 3 步：我开始自动化控制

我会通过 HTTP API 执行以下操作：

#### 流程 1: 注册新用户
```bash
# 1. 截图看当前页面状态
curl -s http://localhost:8765/screenshot -o step01_initial.png

# 2. 移动鼠标到注册链接/按钮
curl -s -X POST http://localhost:8765/move_mouse \
  -H "Content-Type: application/json" \
  -d '{"x": 1200, "y": 100, "duration": 1}'

# 3. 点击
curl -s -X POST http://localhost:8765/click

# 4. 截图确认
curl -s http://localhost:8765/screenshot -o step02_register_form.png

# 5. 输入用户名
curl -s -X POST http://localhost:8765/type_text \
  -H "Content-Type: application/json" \
  -d '{"text": "automation_test_user", "interval": 0.05}'

# 6. 按 Tab 切到邮箱
curl -s -X POST http://localhost:8765/press_key \
  -H "Content-Type: application/json" \
  -d '{"key": "tab"}'

# 7. 输入邮箱
curl -s -X POST http://localhost:8765/type_text \
  -H "Content-Type: application/json" \
  -d '{"text": "autotest@example.com", "interval": 0.05}'

# 8. 按 Tab 切到密码
curl -s -X POST http://localhost:8765/press_key \
  -H "Content-Type: application/json" \
  -d '{"key": "tab"}'

# 9. 输入密码
curl -s -X POST http://localhost:8765/type_text \
  -H "Content-Type: application/json" \
  -d '{"text": "TestPassword123!", "interval": 0.05}'

# 10. 点击注册按钮
curl -s -X POST http://localhost:8765/move_mouse \
  -H "Content-Type: application/json" \
  -d '{"x": 960, "y": 700, "duration": 0.5}'
curl -s -X POST http://localhost:8765/click
```

#### 流程 2: 登录
```bash
# 1. 输入邮箱
curl -s -X POST http://localhost:8765/type_text \
  -d '{"text": "autotest@example.com"}'

# 2. Tab 到密码
curl -s -X POST http://localhost:8765/press_key -d '{"key": "tab"}'

# 3. 输入密码
curl -s -X POST http://localhost:8765/type_text \
  -d '{"text": "TestPassword123!"}'

# 4. 点击登录
curl -s -X POST http://localhost:8765/press_key -d '{"key": "return"}'
```

#### 流程 3: 创建画布
```bash
# 1. 等待页面加载
curl -s http://localhost:8765/screenshot -o step03_logged_in.png

# 2. 移动鼠标到"创建画布"按钮
curl -s -X POST http://localhost:8765/move_mouse \
  -d '{"x": 300, "y": 200, "duration": 1}'

# 3. 点击
curl -s -X POST http://localhost:8765/click

# 4. 输入画布名称
curl -s -X POST http://localhost:8765/type_text \
  -d '{"text": "自动化测试画布", "interval": 0.05}'

# 5. 点击确定
curl -s -X POST http://localhost:8765/click
```

#### 流程 4: 绘制图形
```bash
# 1. 双击打开画布
curl -s -X POST http://localhost:8765/move_mouse \
  -d '{"x": 500, "y": 400, "duration": 1}'
curl -s -X POST http://localhost:8765/click -d '{"clicks": 2}'

# 2. 等待编辑器加载
curl -s http://localhost:8765/screenshot -o step04_editor.png

# 3. 选择矩形工具 (假设工具栏在左侧)
curl -s -X POST http://localhost:8765/move_mouse \
  -d '{"x": 100, "y": 300, "duration": 0.5}'
curl -s -X POST http://localhost:8765/click

# 4. 在画布上画矩形
curl -s -X POST http://localhost:8765/move_mouse \
  -d '{"x": 600, "y": 400, "duration": 1}'
curl -s -X POST http://localhost:8765/drag \
  -d '{"dx": 300, "dy": 200, "duration": 1}'

# 5. 截图结果
curl -s http://localhost:8765/screenshot -o step05_drawn.png
```

## 坐标调试

由于不知道你的屏幕分辨率，我需要先截图看实际位置，再调整坐标。

### 屏幕尺寸
```bash
curl -s http://localhost:8765/screen_size
```

### 当前鼠标位置
```bash
curl -s http://localhost:8765/mouse_position
```

## 手动测试单个操作

```bash
# 截图
curl -s http://localhost:8765/screenshot -o test.png

# 移动鼠标到中央
curl -s -X POST http://localhost:8765/move_mouse \
  -d '{"x": 960, "y": 540, "duration": 2}'

# 点击
curl -s -X POST http://localhost:8765/click

# 输入文字
curl -s -X POST http://localhost:8765/type_text \
  -d '{"text": "Hello DrawWork!"}'
```

## 停止自动化

移动鼠标到屏幕左上角，或关闭各个命令行窗口。
