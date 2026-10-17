import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..', 'dist/desktop');
const manifest = JSON.parse(await readFile(root + '/package.json', 'utf8'));
assert.equal(manifest.main, 'main/main.cjs');
const main = await readFile(root + '/main/main.cjs', 'utf8');
const preload = await readFile(root + '/preload.cjs', 'utf8');
const html = await readFile(root + '/renderer/index.html', 'utf8');
assert(main.includes('contextIsolation: true'));
assert(main.includes('nodeIntegration: false'));
assert(main.includes('sandbox: true'));
assert(!main.includes('require("vscode")'));
assert(preload.includes('exposeInMainWorld'));
assert(preload.includes('kova:send'));
assert(!preload.includes('exposeInMainWorld("ipcRenderer"'));
assert(html.includes('Content-Security-Policy'));
assert(html.includes("connect-src 'none'"));
assert(html.includes("default-src 'none'"));
assert(html.includes("script-src 'self'"));
assert(!html.includes("script-src 'self' 'unsafe-inline'"));
assert.equal(manifest.dependencies['node-pty'], '1.1.0');
const native = `${root}/node_modules/node-pty/prebuilds/${process.platform}-${process.arch}`;
assert((await stat(`${native}/${process.platform === 'win32' ? 'conpty' : 'pty'}.node`)).size > 0);
if (process.platform === 'darwin') assert((await stat(`${native}/spawn-helper`)).mode & 0o111);
// Load the staged module, rather than the development copy, and exercise its native runtime.
const { spawn } = createRequire(`${root}/package.json`)('node-pty');
const terminal = spawn(
  process.platform === 'win32' ? 'powershell.exe' : '/bin/sh',
  process.platform === 'win32'
    ? ['-NoLogo', '-NoProfile', '-Command', 'Write-Output KOVA_PACKAGED_PTY_OK']
    : ['-c', 'printf "KOVA_PACKAGED_PTY_OK\\n"'],
  { cwd: root, env: process.env, cols: 80, rows: 24 },
);
let output = '';
terminal.onData((data) => (output += data));
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    terminal.kill();
    reject(new Error(`Packaged terminal timed out: ${output}`));
  }, 10000);
  terminal.onExit(({ exitCode }) => {
    clearTimeout(timeout);
    if (exitCode === 0 && output.includes('KOVA_PACKAGED_PTY_OK')) resolve();
    else reject(new Error(`Packaged terminal failed (${exitCode}): ${output}`));
  });
});
assert((await readFile(root + '/THIRD-PARTY-NOTICES.txt', 'utf8')).includes('node-pty@1.1.0'));
assert((await readdir(root + '/renderer/assets')).some((name) => name.endsWith('.js')));
assert((await readFile(root + '/THIRD-PARTY-NOTICES.txt', 'utf8')).includes('react@'));
console.log(
  `PASS Kova Desktop ${manifest.version}: isolated renderer, sandboxed preload, restricted CSP, working packaged PTY and license notices.`,
);
