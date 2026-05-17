const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.resolve(__dirname, '..', 'results');
const REPORT_PATH = path.join(RESULTS_DIR, 'last-failure-report.md');
const TEST_RESULTS_DIR = path.join(RESULTS_DIR, 'test-results');

function findFiles(dir, pattern) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, pattern));
    } else if (pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function extractTraceData(traceDir) {
  const traceFile = path.join(traceDir, 'trace.zip');
  if (fs.existsSync(traceFile)) {
    return traceFile;
  }
  return null;
}

function generateReport() {
  let report = `# E2E 测试失败报告\n\n`;
  report += `生成时间: ${new Date().toISOString()}\n\n`;

  // Find all test result directories
  const resultDirs = [];
  if (fs.existsSync(TEST_RESULTS_DIR)) {
    const entries = fs.readdirSync(TEST_RESULTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        resultDirs.push(path.join(TEST_RESULTS_DIR, entry.name));
      }
    }
  }

  if (resultDirs.length === 0) {
    report += `未找到测试失败结果目录。\n`;
    fs.writeFileSync(REPORT_PATH, report);
    return;
  }

  report += `## 失败测试汇总\n\n`;

  for (const dir of resultDirs) {
    const testName = path.basename(dir);
    report += `### ${testName}\n\n`;

    // Screenshots
    const screenshots = findFiles(dir, /\.png$/);
    if (screenshots.length > 0) {
      report += `**截图:**\n`;
      for (const s of screenshots) {
        report += `- \`${path.relative(RESULTS_DIR, s)}\`\n`;
      }
      report += `\n`;
    }

    // Videos
    const videos = findFiles(dir, /\.webm$/);
    if (videos.length > 0) {
      report += `**录屏:**\n`;
      for (const v of videos) {
        report += `- \`${path.relative(RESULTS_DIR, v)}\`\n`;
      }
      report += `\n`;
    }

    // Trace
    const trace = extractTraceData(dir);
    if (trace) {
      report += `**Trace:** \`${path.relative(RESULTS_DIR, trace)}\` (用 \\\`npx playwright show-trace ${path.relative(RESULTS_DIR, trace)}\\\` 查看)\n\n`;
    }

    // Stderr / stdout
    const stderrFile = path.join(dir, 'stderr.txt');
    if (fs.existsSync(stderrFile)) {
      const stderr = fs.readFileSync(stderrFile, 'utf-8').trim();
      if (stderr) {
        report += `**Stderr:**\n\`\`\`\n${stderr}\n\`\`\`\n\n`;
      }
    }
  }

  report += `## 建议修复步骤\n\n`;
  report += `1. 查看上方截图，确认页面状态\n`;
  report += `2. 检查 stderr 中的 console errors / page errors\n`;
  report += `3. 如有 trace，运行 \\\`npx playwright show-trace <path>\\\` 交互式回放\n`;
  report += `4. 修复源码后重新运行 \\\`npm run e2e:loop\\\`\n`;

  fs.writeFileSync(REPORT_PATH, report);
  console.log(`[reporter] Report written to ${REPORT_PATH}`);
}

generateReport();
