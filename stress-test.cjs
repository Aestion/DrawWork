const { execSync } = require('child_process');

function mcp(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', shell: 'cmd.exe', timeout: 120000 }).trim();
  } catch(e) { return 'ERR: ' + (e.stdout || e.stderr || '').slice(0,100); }
}

async function run() {
  console.log('=== PHASE 1: Rapid Keyboard Events on Both Instances ===');

  // Simulate rapid typing on both instances simultaneously
  for (let batch = 0; batch < 5; batch++) {
    // UserA
    mcp('mcporter call chrome-devtools-mcp.evaluate_script function="() => { for(let i=0;i<10;i++) { document.querySelector(\'.excalidraw\').dispatchEvent(new KeyboardEvent(\'keydown\',{key:\'t\'})); } return \'batch \' + i; }"');
    // CollabUser2
    mcp('mcporter call chrome-devtools-mcp-2.evaluate_script function="() => { for(let i=0;i<10;i++) { document.querySelector(\'.excalidraw\').dispatchEvent(new KeyboardEvent(\'keydown\',{key:\'t\'})); } return \'batch \' + i; }"');
  }

  console.log('=== PHASE 2: Check Sync Status ===');
  const s1 = mcp('mcporter call chrome-devtools-mcp.take_snapshot | findstr "人在线 synced"');
  const s2 = mcp('mcporter call chrome-devtools-mcp-2.take_snapshot | findstr "人在线 synced"');
  console.log('UserA:', s1 || '(partial)');
  console.log('CollabUser2:', s2 || '(partial)');

  console.log('=== PHASE 3: Check Console Errors ===');
  const c1 = mcp('mcporter call chrome-devtools-mcp.list_console_messages | findstr "error Error"');
  const c2 = mcp('mcporter call chrome-devtools-mcp-2.list_console_messages | findstr "error Error"');
  console.log('UserA errors:', c1 || '(none)');
  console.log('CollabUser2 errors:', c2 || '(none)');

  console.log('=== PHASE 4: Stress complete ===');
}

run().catch(console.error);
