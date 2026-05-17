const { spawn: rawSpawn } = require('child_process');
const spawn = require('cross-spawn');
const http = require('http');
const path = require('path');
const fs = require('fs');

const BACKEND_PORT = 3000;
const FRONTEND_PORT = 5173;
const WS_PORT = 3001;
const BACKEND_HEALTH = `http://localhost:${BACKEND_PORT}/health`;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;
const ROOT_DIR = path.resolve(__dirname, '..', '..');

const E2E_DB_PATH = path.join(ROOT_DIR, 'test', 'level1-playwright', 'e2e-test.db');

function waitForUrl(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      }).on('error', retry);

      function retry() {
        if (Date.now() - start > timeout) {
          reject(new Error(`Timeout waiting for ${url}`));
        } else {
          setTimeout(check, 500);
        }
      }
    };
    check();
  });
}

function killPortOccupiers(port) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve();
      return;
    }
    const cmd = spawn('cmd', ['/c', `netstat -ano | findstr :${port} | findstr LISTENING`]);
    let output = '';
    cmd.stdout.on('data', (d) => { output += d.toString(); });
    cmd.on('close', () => {
      const lines = output.split('\n').filter(l => l.includes('LISTENING'));
      let killed = 0;
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid)) {
          spawn('taskkill', ['/PID', pid, '/F', '/T']).on('close', () => {});
          killed++;
        }
      }
      setTimeout(resolve, killed > 0 ? 1500 : 0);
    });
  });
}

function spawnProcess(command, args, options) {
  const proc = spawn(command, args, {
    cwd: options?.cwd || ROOT_DIR,
    shell: false,
    stdio: 'pipe',
    env: { ...process.env, ...options?.env },
  });

  let output = '';
  proc.stdout.on('data', (data) => {
    output += data.toString();
    if (process.env.DEBUG_SERVERS) {
      console.log(`[${command}] ${data.toString().trim()}`);
    }
  });
  proc.stderr.on('data', (data) => {
    output += data.toString();
    if (process.env.DEBUG_SERVERS) {
      console.error(`[${command}] ${data.toString().trim()}`);
    }
  });

  return { proc, output: () => output };
}

function killProcess(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.killed || proc.exitCode !== null) {
      resolve();
      return;
    }
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', proc.pid.toString(), '/f', '/t'])
        .on('close', resolve)
        .on('error', () => { proc.kill(); resolve(); });
    } else {
      proc.kill('SIGTERM');
      setTimeout(() => { if (!proc.killed) proc.kill('SIGKILL'); resolve(); }, 2000);
    }
  });
}

function resetE2EDatabase() {
  if (fs.existsSync(E2E_DB_PATH)) {
    fs.unlinkSync(E2E_DB_PATH);
    console.log('[runner] Removed old E2E database:', E2E_DB_PATH);
  }
}

async function main() {
  // Pre-clean: kill any leftover processes on our ports
  await killPortOccupiers(BACKEND_PORT);
  await killPortOccupiers(FRONTEND_PORT);
  await killPortOccupiers(WS_PORT);

  resetE2EDatabase();

  const resultsDir = path.join(ROOT_DIR, 'test', 'level1-playwright', 'results');
  if (fs.existsSync(resultsDir)) {
    fs.rmSync(resultsDir, { recursive: true });
  }
  fs.mkdirSync(path.join(resultsDir, 'screenshots'), { recursive: true });

  console.log('[runner] Starting backend with E2E database...');
  const backend = spawnProcess('node', ['backend/src/app.js'], {
    env: {
      NODE_ENV: 'test',
      PORT: String(BACKEND_PORT),
      WS_PORT: String(WS_PORT),
      DATABASE_URL: `sqlite:${E2E_DB_PATH}`,
    },
  });

  console.log('[runner] Starting WebSocket server...');
  const wsServer = spawnProcess('node', ['backend/src/ws-server.js'], {
    env: { NODE_ENV: 'test', WS_PORT: String(WS_PORT) },
  });

  console.log('[runner] Starting frontend...');
  const frontend = spawnProcess('npm', ['run', 'dev', '--', '--port', String(FRONTEND_PORT)], {
    cwd: path.join(ROOT_DIR, 'frontend'),
    env: { NODE_ENV: 'development' },
  });

  try {
    await waitForUrl(BACKEND_HEALTH, 30000);
    console.log(`[runner] Backend ready at ${BACKEND_HEALTH}`);

    await waitForUrl(FRONTEND_URL, 30000);
    console.log(`[runner] Frontend ready at ${FRONTEND_URL}`);
  } catch (err) {
    console.error('[runner] Server startup failed:', err.message);
    console.error('[runner] Backend output:\n', backend.output());
    console.error('[runner] Frontend output:\n', frontend.output());
    await killProcess(backend.proc);
    await killProcess(frontend.proc);
    process.exit(1);
  }

  console.log('[runner] Running Playwright tests...');
  const testProc = spawn('npx', ['playwright', 'test', '--config', 'test/level1-playwright/playwright.config.js'], {
    cwd: ROOT_DIR,
    shell: false,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test' },
  });

  const exitCode = await new Promise((resolve) => {
    testProc.on('close', resolve);
  });

  console.log(`[runner] Playwright exited with code ${exitCode}`);

  await killProcess(frontend.proc);
  await killProcess(backend.proc);
  await killProcess(wsServer.proc);

  // Final cleanup: ensure ports are free
  await killPortOccupiers(BACKEND_PORT);
  await killPortOccupiers(FRONTEND_PORT);
  await killPortOccupiers(WS_PORT);

  if (exitCode !== 0) {
    const reporterPath = path.join(__dirname, 'reporter.js');
    if (fs.existsSync(reporterPath)) {
      console.log('[runner] Generating failure report...');
      require(reporterPath);
    }
    console.log('\n❌ E2E tests failed.');
    console.log('   Report: test/level1-playwright/results/last-failure-report.md');
    console.log('   Screenshots: test/level1-playwright/results/test-results/');
    process.exit(1);
  }

  console.log('\n✅ All E2E tests passed.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[runner] Fatal error:', err);
  process.exit(1);
});
