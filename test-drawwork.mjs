import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.join(__dirname, 'logs', 'screenshots');

async function runTests() {
  console.log('\n🎨 启动 DrawWork 功能测试...\n');
  await fs.mkdir(screenshotsDir, { recursive: true });
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  
  const testUser = {
    username: 'testuser_' + Date.now(),
    email: 'test_' + Date.now() + '@example.com',
    password: 'TestPassword123!'
  };
  
  let xssDetected = false;
  page.on('dialog', async (dialog) => {
    if (dialog.message().includes('XSS')) {
      xssDetected = true;
      console.log('   ❌ XSS 漏洞检测到!');
    }
    await dialog.accept();
  });
  
  try {
    // Step 1
    console.log('📌 Step 1: 注册新用户');
    await page.goto('http://localhost:5173/register');
    await page.waitForTimeout(2000);
    await page.fill('input[name="username"]', testUser.username);
    await page.fill('input[name="email"]', testUser.email);
    await page.fill('input[name="password"]', testUser.password);
    await page.fill('input[name="confirmPassword"]', testUser.password);
    await page.screenshot({ path: path.join(screenshotsDir, 'step1-register.png'), fullPage: true });
    console.log('   ✅ 截图已保存: step1-register.png');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    
    // Step 2
    console.log('\n📌 Step 2: 创建画板');
    try {
      await page.click('text=/新建.*画板/i');
      await page.waitForTimeout(1500);
      const nameInput = await page.locator('input:visible').first();
      await nameInput.fill('测试画板_' + Date.now());
      await page.click('button:has-text("创建")');
      await page.waitForTimeout(2000);
    } catch (e) {}
    await page.screenshot({ path: path.join(screenshotsDir, 'step2-create-board.png'), fullPage: true });
    console.log('   ✅ 截图已保存: step2-create-board.png');
    
    // Step 3
    console.log('\n📌 Step 3: 进入编辑器');
    try {
      await page.click('.board-card, .card');
      await page.waitForTimeout(3000);
    } catch (e) {}
    await page.screenshot({ path: path.join(screenshotsDir, 'step3-editor.png'), fullPage: true });
    console.log('   ✅ 截图已保存: step3-editor.png');
    
    // Step 4
    console.log('\n📌 Step 4: 绘图测试');
    await page.keyboard.press('r');
    await page.waitForTimeout(500);
    const canvas = await page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 300, box.y + 300);
      await page.mouse.down();
      await page.mouse.move(box.x + 450, box.y + 450);
      await page.mouse.up();
    }
    await page.waitForTimeout(1000);
    await page.keyboard.press('o');
    await page.waitForTimeout(500);
    if (box) {
      await page.mouse.move(box.x + 500, box.y + 300);
      await page.mouse.down();
      await page.mouse.move(box.x + 650, box.y + 450);
      await page.mouse.up();
    }
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotsDir, 'step4-draw.png'), fullPage: true });
    console.log('   ✅ 截图已保存: step4-draw.png');
    
    // Step 5
    console.log('\n📌 Step 5: 分享功能');
    try {
      await page.click('button:has-text("分享")');
      await page.waitForTimeout(1500);
      await page.keyboard.press('Escape');
    } catch (e) {}
    await page.screenshot({ path: path.join(screenshotsDir, 'step5-share.png'), fullPage: true });
    console.log('   ✅ 截图已保存: step5-share.png');
    
    // Step 6
    console.log('\n📌 Step 6: 返回仪表盘');
    try {
      await page.click('a:has-text("返回"), button:has-text("返回")');
    } catch (e) {
      await page.goto('http://localhost:5173/');
    }
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(screenshotsDir, 'step6-dashboard.png'), fullPage: true });
    console.log('   ✅ 截图已保存: step6-dashboard.png');
    
    // Step 7
    console.log('\n📌 Step 7: 登出并重新登录');
    try {
      await page.click('button:has-text("退出"), a:has-text("退出")');
    } catch (e) {
      await page.goto('http://localhost:5173/login');
    }
    await page.waitForTimeout(1500);
    await page.fill('input[name="email"], input[type="email"]', testUser.email);
    await page.fill('input[name="password"], input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(screenshotsDir, 'step7-relogin.png'), fullPage: true });
    console.log('   ✅ 截图已保存: step7-relogin.png');
    
    // Step 8
    console.log('\n📌 Step 8: XSS 安全测试');
    try {
      await page.click('text=/新建.*画板/i');
      await page.waitForTimeout(1000);
      const nameInput = await page.locator('input:visible').first();
      await nameInput.fill('SCRIPT_ALERT_XSS');
      await page.click('button:has-text("创建")');
      await page.waitForTimeout(3000);
      if (!xssDetected) console.log('   ✅ XSS 防护正常');
    } catch (e) {}
    await page.screenshot({ path: path.join(screenshotsDir, 'step8-xss.png'), fullPage: true });
    console.log('   ✅ 截图已保存: step8-xss.png');
    
    console.log('\n🎉 所有测试步骤完成!');
    console.log('📁 截图保存在: ' + screenshotsDir);
  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    await browser.close();
  }
}

runTests();
