import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { mkdir, copyFile, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

await rm('dist/extension', { recursive: true, force: true });
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
for (const name of ['logo.png', 'logo_mono.png'])
  await copyFile(`assets/${name}`, `dist/extension/media/${name}`);
// Activity Bar icons are alpha masks. Use the supplied monochrome artwork's
// luminance as the mask so its opaque background cannot become a solid square.
const mono = await readFile('assets/logo_mono.png');
const iconWidth = mono.readUInt32BE(16),
  iconHeight = mono.readUInt32BE(20);
const crop = Math.min(iconWidth, iconHeight) * 0.8;
await writeFile(
  'dist/extension/media/activity-icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(iconWidth - crop) / 2} ${(iconHeight - crop) / 2} ${crop} ${crop}"><defs><mask id="mark" maskUnits="userSpaceOnUse" x="0" y="0" width="${iconWidth}" height="${iconHeight}" style="mask-type:luminance"><image width="${iconWidth}" height="${iconHeight}" href="data:image/png;base64,${mono.toString('base64')}"/></mask></defs><rect width="${iconWidth}" height="${iconHeight}" fill="white" mask="url(#mark)"/></svg>`,
);
await copyFile('docs/SETUP.md', 'dist/extension/SETUP.md');
await copyFile('docs/USAGE.md', 'dist/extension/USAGE.md');

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
