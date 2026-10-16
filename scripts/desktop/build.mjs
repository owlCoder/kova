import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { writeDependencyNotices } from '../dependency-notices.mjs';

const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, 'dist/desktop');
const manifest = JSON.parse(await readFile(resolve(root, 'packages/desktop/package.json'), 'utf8'));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await viteBuild({
  configFile: resolve(root, 'webview/vite.config.ts'),
  build: { outDir: output + '/renderer', emptyOutDir: true },
  plugins: [
    {
      name: 'desktop-csp',
      transformIndexHtml: (html) =>
        html.replace(
          '<head>',
          `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none';">`,
        ),
    },
  ],
});
const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: true,
  legalComments: 'external',
  metafile: true,
};
const main = await build({
  ...common,
  entryPoints: [resolve(root, 'packages/desktop/src/main/main.ts')],
  outfile: output + '/main/main.cjs',
});
await build({
  ...common,
  entryPoints: [resolve(root, 'packages/desktop/src/preload.ts')],
  outfile: output + '/preload.cjs',
});
await writeFile(
  output + '/package.json',
  JSON.stringify(
    {
      name: 'kova-desktop',
      version: manifest.version,
      description: manifest.description,
      author: 'Kova contributors',
      license: 'MIT',
      main: 'main/main.cjs',
      private: true,
    },
    null,
    2,
  ),
);
for (const file of ['LICENSE', 'README.md', 'CHANGELOG.md'])
  await copyFile(resolve(root, file), output + '/' + file);
await copyFile(resolve(root, 'assets/logo.png'), output + '/icon.png');
const count = await writeDependencyNotices(
  root,
  Object.keys(main.metafile.inputs),
  output + '/THIRD-PARTY-NOTICES.txt',
);
console.log(`Built Kova Desktop ${manifest.version}; bundled ${count} dependency notices.`);
