import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
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
assert((await readdir(root + '/renderer/assets')).some((name) => name.endsWith('.js')));
assert((await readFile(root + '/THIRD-PARTY-NOTICES.txt', 'utf8')).includes('react@'));
console.log(
  `PASS Kova Desktop ${manifest.version}: isolated renderer, sandboxed preload, restricted CSP, runtime bundle and license notices.`,
);
