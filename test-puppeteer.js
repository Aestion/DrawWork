const puppeteer = require('puppeteer');

(async () => {
  console.log('启动 Puppeteer...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // 1. 导航到示例网站
  console.log('打开 example.com...');
  await page.goto('https://example.com', { waitUntil: 'networkidle2' });

  // 2. 截图
  await page.screenshot({ path: 'puppeteer-test.png', fullPage: true });
  console.log('✅ 截图已保存: puppeteer-test.png');

  // 3. 获取页面标题
  const title = await page.title();
  console.log('📄 页面标题:', title);

  // 4. 获取页面内容
  const content = await page.evaluate(() => {
    return {
      h1: document.querySelector('h1')?.textContent || '无',
      p: document.querySelector('p')?.textContent || '无'
    };
  });
  console.log('📝 页面内容:', content);

  await browser.close();
  console.log('✅ 测试完成！');
})();
