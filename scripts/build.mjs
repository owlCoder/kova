import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { mkdir, copyFile, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

await mkdir('dist/extension/media', { recursive: true });
await viteBuild({ configFile: 'webview/vite.config.ts' });
const bundled = await build({
  entryPoints: ['packages/vscode/src/extension/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['vscode'],
  outfile: 'dist/extension/extension.cjs',
  sourcemap: true,
  legalComments: 'external',
  metafile: true,
});
await copyFile('packages/vscode/extension.package.json', 'dist/extension/package.json');
for (const name of ['README.md', 'CHANGELOG.md', 'LICENSE'])
  await copyFile(name, `dist/extension/${name}`);
await rm('dist/extension/media/kova.svg', { force: true });
for (const name of ['logo.png', 'logo_mono.png'])
  await copyFile(`assets/${name}`, `dist/extension/media/${name}`);
await copyFile('docs/SETUP.md', 'dist/extension/SETUP.md');
await rm('dist/extension/.vscodeignore', { force: true });

const packages = new Map();
for (const input of [
  ...Object.keys(bundled.metafile.inputs),
  'node_modules/react/index.js',
  'node_modules/react-dom/index.js',
  'node_modules/scheduler/index.js',
]) {
  if (!input.startsWith('node_modules/')) continue;
  let folder = dirname(resolve(input));
  while (folder !== dirname(folder)) {
    try {
      const manifest = JSON.parse(await readFile(resolve(folder, 'package.json'), 'utf8'));
      if (manifest.name && manifest.version) {
        packages.set(`${manifest.name}@${manifest.version}`, folder);
        break;
      }
    } catch {
      /* walk to the package root */
    }
    folder = dirname(folder);
  }
}
const notices = [];
for (const [name, folder] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
  const licenseFiles = (await readdir(folder)).filter((file) =>
    /^(license|licence|copying)(?:\.|$)/i.test(file),
  );
  if (!licenseFiles.length)
    throw new Error(`Bundled dependency ${name} has no packaged license file.`);
  notices.push(
    `${name}\n${(await Promise.all(licenseFiles.map((file) => readFile(resolve(folder, file), 'utf8')))).join('\n')}`,
  );
}
await writeFile(
  'dist/extension/THIRD-PARTY-NOTICES.txt',
  notices.join('\n\n----------------------------------------\n\n'),
);
console.log(
  `Built extension and Webview in dist/extension; included ${packages.size} dependency license notices.`,
);
