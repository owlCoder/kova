import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { writeDependencyNotices } from './dependency-notices.mjs';

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

const count = await writeDependencyNotices(
  resolve('.'),
  Object.keys(bundled.metafile.inputs),
  'dist/extension/THIRD-PARTY-NOTICES.txt',
);
console.log(
  `Built extension and Webview in dist/extension; included ${count} dependency license notices.`,
);
