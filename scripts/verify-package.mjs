import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extensionManifest, releaseArchivePath } from './release-paths.mjs';

const archive = releaseArchivePath;
const entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim().split('\n');
const contents = (name) =>
  execFileSync('unzip', ['-p', archive, `extension/${name}`], { maxBuffer: 20 * 1024 * 1024 });
for (const name of [
  'package.json',
  'extension.cjs',
  'media/logo.png',
  'media/logo_mono.png',
  'media/activity-icon.svg',
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
assert.equal(manifest.name, extensionManifest.name);
assert.equal(manifest.publisher, 'owlcoder');
assert.equal(manifest.version, extensionManifest.version);
assert.equal(manifest.license, 'MIT');
assert.equal(manifest.icon, 'media/logo.png');
assert.match(manifest.displayName, /Local-first/);
assert.match(manifest.description, /Ollama/);
assert.match(manifest.description, /DeepSeek/);
assert.deepEqual(manifest.contributes.configuration.properties['kova.provider'].enum, [
  'ollama',
  'deepseek',
  'openaiCompatible',
]);
assert.equal(manifest.contributes.configuration.properties['kova.provider'].default, 'ollama');
assert(
  !Object.keys(manifest.contributes.configuration.properties).some((key) =>
    key.toLowerCase().includes('apikey'),
  ),
  'API keys must not be declared as plaintext settings',
);
assert.equal(manifest.contributes.viewsContainers.activitybar[0].icon, 'media/activity-icon.svg');
const activityIcon = contents('media/activity-icon.svg').toString('utf8');
assert(activityIcon.includes('mask-type:luminance'));
assert(
  activityIcon.includes(
    `data:image/png;base64,${contents('media/logo_mono.png').toString('base64')}`,
  ),
);
assert.equal(manifest.contributes.views.kova[0].id, 'kova.chat');
for (const command of [
  'kova.open',
  'kova.openInEditor',
  'kova.setProviderApiKey',
  'kova.clearProviderApiKey',
])
  assert(manifest.contributes.commands.some((item) => item.command === command), `Missing ${command}`);
assert(manifest.activationEvents.includes('onCommand:kova.open'));
const readme = contents('readme.md').toString('utf8');
assert.match(readme, /Ollama/);
assert.match(readme, /DeepSeek/);
assert.match(readme, /OpenAI-compatible/);
assert.match(contents('changelog.md').toString('utf8'), new RegExp(`## ${manifest.version.replaceAll('.', '\\.')}`));
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
  `PASS VSIX: ${entries.length} entries, provider-aware manifest/README, original logos, bundled runtime, license notices and no development/secret files.`,
);
