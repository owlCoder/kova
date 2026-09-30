import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
export const extensionManifest = JSON.parse(
  await readFile(resolve(repositoryRoot, 'packages/vscode/extension.package.json'), 'utf8'),
);
if (!/^[a-z0-9-]+$/.test(extensionManifest.name)) throw new Error('Invalid extension name.');
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(extensionManifest.version))
  throw new Error('Invalid extension version.');
export const extensionOutputDirectory = resolve(repositoryRoot, 'dist/extension');
export const releaseArchiveName = `${extensionManifest.name}-${extensionManifest.version}.vsix`;
export const releaseArchivePath = resolve(repositoryRoot, 'dist', releaseArchiveName);
