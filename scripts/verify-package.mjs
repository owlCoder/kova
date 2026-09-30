import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const archive = resolve('dist/kova-0.1.0.vsix');
const entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim().split('\n');
const contents = (name) =>
  execFileSync('unzip', ['-p', archive, `extension/${name}`], { maxBuffer: 20 * 1024 * 1024 });
for (const name of [
  'package.json',
  'extension.cjs',
  'media/logo.png',
  'media/logo_mono.png',
  'webview/assets/main.js',
  'webview/assets/index.css',
  'readme.md',
  'changelog.md',
  'LICENSE.txt',
  'THIRD-PARTY-NOTICES.txt',
  'SETUP.md',
])
  assert(entries.includes(`extension/${name}`), `Missing ${name}`);
assert(
  !entries.some((name) =>
    /(?:\.map$|\/node_modules\/|\/src\/|\/tests\/|\.env(?:\.|$)|\/\.kova\/)/.test(name),
  ),
  'Development files in VSIX',
);
const manifest = JSON.parse(contents('package.json').toString('utf8'));
assert.equal(manifest.publisher, 'owlcoder');
assert.equal(manifest.version, '0.1.0');
assert.equal(manifest.license, 'MIT');
assert.equal(manifest.icon, 'media/logo.png');
assert.equal(manifest.contributes.viewsContainers.activitybar[0].icon, 'media/logo_mono.png');
const icon = contents(manifest.icon);
assert(icon.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
assert(icon.readUInt32BE(16) >= 128 && icon.readUInt32BE(20) >= 128);
for (const name of ['logo.png', 'logo_mono.png'])
  assert.equal(
    createHash('sha256')
      .update(contents(`media/${name}`))
      .digest('hex'),
    createHash('sha256')
      .update(await readFile(`assets/${name}`))
      .digest('hex'),
    `Altered ${name}`,
  );
execFileSync(process.execPath, ['--check', resolve('dist/extension/extension.cjs')]);
console.log(
  `PASS VSIX: ${entries.length} entries, valid manifest/icons, original logos, bundled runtime, license notices and no development/secret files.`,
);
