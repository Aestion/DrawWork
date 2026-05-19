import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync, unlinkSync, appendFileSync } from 'fs';

const URL = 'https://doc.weixin.qq.com/mind/m4_AeUArAYSAH4CNBZS58tR4R369W6ZQ?scode=ACEA4wcDAAoe3QqksJ&subId=BB08J2&mode=mind';
const COOKIE_FILE = 'C:/Users/acis/.claude/tencent-cookies.json';
const LOG_FILE = 'e:/DrawWork/captured-api-data.json';
const TRIGGER_FILE = 'C:/Users/acis/.claude/capture-trigger.txt';

if (existsSync(LOG_FILE)) unlinkSync(LOG_FILE);
if (existsSync(TRIGGER_FILE)) unlinkSync(TRIGGER_FILE);

const browser = await chromium.launch({
  headless: false,
  channel: 'chrome'
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 800 }
});

if (existsSync(COOKIE_FILE)) {
  const cookies = JSON.parse(readFileSync(COOKIE_FILE, 'utf-8'));
  await context.addCookies(cookies);
}

const page = await context.newPage();

// 监听所有 XHR/fetch 请求的响应
const captured = [];

page.on('response', async (response) => {
  const url = response.url();
  // 捕获 mind API 相关的所有请求
  if (url.includes('dop-api/mind/')) {
    try {
      const json = await response.json();
      const entry = {
        time: new Date().toISOString(),
        url: url,
        method: response.request().method(),
        status: response.status(),
        data: json
      };
      captured.push(entry);
      appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
      console.log('[CAPTURED]', url.split('?')[0].split('/').slice(-3).join('/'), '- status:', response.status());
    } catch (e) {
      console.log('[SKIP]', url, '- non-json response');
    }
  }
});

console.log('Opening page...');
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('Page loaded. Monitoring API calls...');
console.log('Do your operations. When done, I will create the trigger file.');
console.log('(Or type "stop" in trigger file to close)');

// Poll for trigger file
while (true) {
  await page.waitForTimeout(1000);
  if (existsSync(TRIGGER_FILE)) {
    const trigger = readFileSync(TRIGGER_FILE, 'utf-8').trim();
    if (trigger === 'stop') break;
    if (trigger === 'save') {
      console.log('\n=== SAVING CAPTURED DATA ===');
      const summary = captured.map(c => ({
        url: c.url.split('?')[0],
        method: c.method,
        status: c.status,
        time: c.time,
        keys: c.data ? Object.keys(c.data) : []
      }));
      writeFileSync('e:/DrawWork/captured-api-summary.json', JSON.stringify(summary, null, 2));
      console.log('Saved', captured.length, 'entries');
      break;
    }
  }
}

// Save cookies
const cookies = await context.cookies();
writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2), 'utf-8');

if (existsSync(TRIGGER_FILE)) unlinkSync(TRIGGER_FILE);
await browser.close();
console.log('Browser closed.');
