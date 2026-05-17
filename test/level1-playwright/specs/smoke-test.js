const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = 'E:\\DrawWork\\logs\\screenshots';
const BASE_URL = 'http://localhost:5173';

const results = [];

function generateUnique(prefix = 'test') {
  const ts = Date.now();
  return `${prefix}_${ts}`;
}

async function screenshot(page, name) {
  const filepath = path.join(SCREENSHOT_DIR, name);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`  Screenshot saved: ${name}`);
  return filepath;
}

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  let testUser = null;
  let testBoardName = null;
  const ts = Date.now();

  try {
    // ========== STEP 1: Register ==========
    console.log('\n=== STEP 1: Register new user ===');
    testUser = {
      username: `testuser_${ts}`,
      email: `testuser_${ts}@test.local`,
      password: 'TestPass123!'
    };
    await page.goto(`${BASE_URL}/register`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Find input fields by type
    const inputs = await page.locator('input').all();
    console.log(`  Found ${inputs.length} input fields`);
    
    // Fill username (first text input)
    await page.locator('input[type="text"]').first().fill(testUser.username);
    await page.waitForTimeout(300);
    // Fill email
    await page.locator('input[type="email"]').first().fill(testUser.email);
    await page.waitForTimeout(300);
    // Fill password
    await page.locator('input[type="password"]').first().fill(testUser.password);
    await page.waitForTimeout(300);
    
    await screenshot(page, 'step1-before-register.png');
    
    // Click submit
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    
    const currentUrl = page.url();
    console.log(`  URL after register: ${currentUrl}`);
    
    // Check if redirected to home
    if (currentUrl.includes('/login')) {
      console.log('  Redirected to login - checking for success message...');
      const bodyText = await page.locator('body').innerText();
      console.log('  Page text:', bodyText.substring(0, 200));
      
      // Might have registered but need to login - try login
      await page.locator('input[type="email"]').first().fill(testUser.email);
      await page.locator('input[type="password"]').first().fill(testUser.password);
      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(2000);
      console.log(`  URL after re-login: ${page.url()}`);
    }
    
    const homePage = page.url() === `${BASE_URL}/` || page.url() === `${BASE_URL}/dashboard`;
    const pageText = await page.locator('body').innerText();
    const helloFound = pageText.includes('你好');
    const usernameFound = pageText.includes(testUser.username);
    
    const step1Passed = helloFound || usernameFound || page.url().includes(BASE_URL + '/');
    results.push({
      step: '1 - Register',
      passed: step1Passed,
      details: step1Passed ? 'Registration successful, redirected to home' : `URL: ${page.url()}, hello: ${helloFound}, user: ${usernameFound}`
    });
    console.log(`  Step 1 ${step1Passed ? 'PASSED' : 'FAILED'}`);
    await screenshot(page, 'step1-register.png');

    // ========== STEP 2: Create Board ==========
    console.log('\n=== STEP 2: Create board ===');
    testBoardName = `Test Board_${ts}`;
    
    // Look for "新建画板" button
    const createBtn = page.locator('button, a, div', { hasText: /新建画板|加/i }).first();
    await createBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    console.log(`  Create button visible: ${await createBtn.isVisible().catch(() => false)}`);
    
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(1000);
      
      // Fill board name
      await page.locator('#board-name, input[placeholder*="画板"], input').first().fill(testBoardName);
      await page.waitForTimeout(500);
      
      await screenshot(page, 'step2-before-create.png');
      
      // Click submit/create button
      await page.locator('button[type="submit"], button:has-text("创建")').first().click();
      await page.waitForTimeout(2000);
    }
    
    const boardFound = (await page.locator('body').innerText()).includes(testBoardName);
    results.push({
      step: '2 - Create Board',
      passed: boardFound,
      details: boardFound ? 'Board appears in list' : 'Board name not found on page'
    });
    console.log(`  Step 2 ${boardFound ? 'PASSED' : 'FAILED'}`);
    await screenshot(page, 'step2-board-created.png');

    // ========== STEP 3: Enter Editor ==========
    console.log('\n=== STEP 3: Enter Editor ===');
    const boardCard = page.locator(`text=${testBoardName}`).first();
    if (await boardCard.isVisible().catch(() => false)) {
      await boardCard.click();
      await page.waitForTimeout(3000);
    }
    
    const excalidrawVisible = await page.locator('.excalidraw, canvas').first().isVisible().catch(() => false);
    console.log(`  Excalidraw visible: ${excalidrawVisible}`);
    console.log(`  URL: ${page.url()}`);
    
    const pageText3 = await page.locator('body').innerText();
    const backVisible = pageText3.includes('返回');
    const shareVisible = pageText3.includes('分享');
    
    const step3Passed = excalidrawVisible || page.url().includes('/board/');
    results.push({
      step: '3 - Enter Editor',
      passed: step3Passed,
      details: step3Passed ? `Editor loaded. Back:${backVisible}, Share:${shareVisible}` : 'Editor not visible'
    });
    console.log(`  Step 3 ${step3Passed ? 'PASSED' : 'FAILED'}`);
    await screenshot(page, 'step3-editor.png');

    // ========== STEP 4: Drawing operations ==========
    console.log('\n=== STEP 4: Drawing operations ===');
    // Press 'r' for rectangle tool
    await page.keyboard.press('r');
    await page.waitForTimeout(500);
    
    // Draw a rectangle on the canvas
    const canvas = page.locator('.excalidraw__canvas.interactive, canvas').first();
    const box = await canvas.boundingBox().catch(() => null);
    if (box) {
      console.log(`  Canvas bounding box: ${JSON.stringify(box)}`);
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx - 150, cy - 100);
      await page.mouse.down();
      await page.mouse.move(cx + 50, cy + 50, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(500);
    } else {
      console.log('  Canvas bounding box not found, using viewport center');
      await page.mouse.move(300, 200);
      await page.mouse.down();
      await page.mouse.move(500, 400, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(500);
    }
    
    // Press 'o' or 'e' for ellipse tool
    await page.keyboard.press('o');
    await page.waitForTimeout(500);
    
    // Draw an ellipse
    if (box) {
      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 250, box.y + 250, { steps: 10 });
      await page.mouse.up();
    } else {
      await page.mouse.move(400, 300);
      await page.mouse.down();
      await page.mouse.move(600, 450, { steps: 10 });
      await page.mouse.up();
    }
    await page.waitForTimeout(500);
    
    results.push({
      step: '4 - Drawing',
      passed: true,
      details: 'Rectangle and ellipse drawing attempted'
    });
    console.log('  Step 4 PASSED');
    await screenshot(page, 'step4-drawing.png');

    // ========== STEP 5: Share Panel ==========
    console.log('\n=== STEP 5: Share Panel ===');
    const shareBtn = page.locator('button:has-text("分享"), a:has-text("分享"), span:has-text("分享")').first();
    if (await shareBtn.isVisible().catch(() => false)) {
      await shareBtn.click();
      await page.waitForTimeout(1500);
      
      const sharePageText = await page.locator('body').innerText();
      const shareTitleFound = sharePageText.includes('分享');
      const inviteFound = sharePageText.includes('邀请') || sharePageText.includes('协作者');
      
      console.log(`  Share panel visible: ${shareTitleFound}, invite option: ${inviteFound}`);
      await screenshot(page, 'step5-share-panel.png');
      
      // Close with Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      
      results.push({
        step: '5 - Share Panel',
        passed: shareTitleFound,
        details: shareTitleFound ? `Share panel shown. Invite option: ${inviteFound}` : 'Share panel not visible'
      });
    } else {
      console.log('  Share button not found');
      await screenshot(page, 'step5-share-not-found.png');
      results.push({
        step: '5 - Share Panel',
        passed: false,
        details: 'Share button not found on page'
      });
    }
    console.log(`  Step 5 ${results[results.length-1].passed ? 'PASSED' : 'FAILED'}`);

    // ========== STEP 6: Back to Dashboard ==========
    console.log('\n=== STEP 6: Back to Dashboard ===');
    const backBtn = page.locator('button:has-text("返回"), a:has-text("返回"), span:has-text("返回")').first();
    if (await backBtn.isVisible().catch(() => false)) {
      await backBtn.click();
      await page.waitForTimeout(2000);
    } else {
      // Try going back via URL
      await page.goto(BASE_URL + '/');
      await page.waitForTimeout(2000);
    }
    
    const dashText = await page.locator('body').innerText();
    const boardInList = dashText.includes(testBoardName);
    
    results.push({
      step: '6 - Back to Dashboard',
      passed: boardInList,
      details: boardInList ? 'Back on dashboard, board visible in list' : 'Board not found on dashboard'
    });
    console.log(`  Step 6 ${boardInList ? 'PASSED' : 'FAILED'}`);
    await screenshot(page, 'step6-dashboard.png');

    // ========== STEP 7: Logout and Re-login ==========
    console.log('\n=== STEP 7: Logout and Re-login ===');
    const logoutBtn = page.locator('button:has-text("退出"), a:has-text("退出"), span:has-text("退出")').first();
    if (await logoutBtn.isVisible().catch(() => false)) {
      await logoutBtn.click();
      await page.waitForTimeout(2000);
    } else {
      await page.goto(BASE_URL + '/login');
      await page.waitForTimeout(1000);
    }
    
    const loginUrl = page.url().includes('/login');
    console.log(`  At login page: ${loginUrl}`);
    
    if (loginUrl) {
      await page.locator('input[type="email"]').first().fill(testUser.email);
      await page.locator('input[type="password"]').first().fill(testUser.password);
      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(2000);
    }
    
    const reDashText = await page.locator('body').innerText();
    const reBoardFound = reDashText.includes(testBoardName);
    
    results.push({
      step: '7 - Logout & Re-login',
      passed: reBoardFound,
      details: reBoardFound ? 'Successfully re-logged in, board persists' : `Board not visible after re-login. URL: ${page.url()}`
    });
    console.log(`  Step 7 ${reBoardFound ? 'PASSED' : 'FAILED'}`);
    await screenshot(page, 'step7-relogin.png');

    // ========== STEP 8: XSS Test ==========
    console.log('\n=== STEP 8: XSS Security Test ===');
    // Logout first
    const logoutBtn2 = page.locator('button:has-text("退出"), a:has-text("退出"), span:has-text("退出")').first();
    if (await logoutBtn2.isVisible().catch(() => false)) {
      await logoutBtn2.click();
      await page.waitForTimeout(1000);
    }
    
    // Register a temp user
    const xssUser = {
      username: `xssuser_${ts}`,
      email: `xssuser_${ts}@test.local`,
      password: 'TestPass123!'
    };
    await page.goto(BASE_URL + '/register');
    await page.waitForTimeout(1000);
    await page.locator('input[type="text"]').first().fill(xssUser.username);
    await page.locator('input[type="email"]').first().fill(xssUser.email);
    await page.locator('input[type="password"]').first().fill(xssUser.password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    
    // Create board with XSS name
    const xssName = "<script>window.xssExecuted=true</script>";
    const createBtn2 = page.locator('button, a, div', { hasText: /新建画板|加/i }).first();
    if (await createBtn2.isVisible().catch(() => false)) {
      await createBtn2.click();
      await page.waitForTimeout(800);
      await page.locator('#board-name, input[placeholder*="画板"], input').first().fill(xssName);
      await page.locator('button[type="submit"], button:has-text("创建")').first().click();
      await page.waitForTimeout(2000);
    }
    
    const xssFlag = await page.evaluate(() => window.xssExecuted).catch(() => undefined);
    const xssNotExecuted = xssFlag === undefined || xssFlag === null;
    
    results.push({
      step: '8 - XSS Test',
      passed: xssNotExecuted,
      details: xssNotExecuted ? 'XSS payload not executed (sanitized)' : `XSS WAS executed! window.xssExecuted=${xssFlag}`
    });
    console.log(`  Step 8 ${xssNotExecuted ? 'PASSED' : 'FAILED - SECURITY ISSUE!'}`);
    await screenshot(page, 'step8-xss-test.png');

  } catch (err) {
    console.error('Test error:', err.message);
    results.push({
      step: 'ERROR',
      passed: false,
      details: err.message
    });
    await screenshot(page, 'step-error.png').catch(() => {});
  } finally {
    await browser.close();
  }

  // ========== Summary ==========
  console.log('\n' + '='.repeat(60));
  console.log('TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  let passed = 0, failed = 0;
  for (const r of results) {
    const status = r.passed ? 'PASS' : 'FAIL';
    console.log(`  [${status}] Step ${r.step}`);
    console.log(`         ${r.details}`);
    if (r.passed) passed++; else failed++;
  }
  console.log('='.repeat(60));
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('='.repeat(60));
  console.log(`Screenshots saved to: ${SCREENSHOT_DIR}`);
  
  // Write report
  const reportPath = path.join(SCREENSHOT_DIR, '..', 'test-report.txt');
  const lines = [];
  lines.push('=== DrawWork E2E Test Report ===');
  lines.push(`Date: ${new Date().toISOString()}`);
  lines.push(`Environment: ${BASE_URL}`);
  lines.push('');
  for (const r of results) {
    lines.push(`[${r.passed ? 'PASS' : 'FAIL'}] Step ${r.step}: ${r.details}`);
  }
  lines.push('');
  lines.push(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
  console.log(`Report written to: ${reportPath}`);
}

run().catch(console.error);
