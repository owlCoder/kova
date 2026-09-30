import { spawnSync } from 'node:child_process';
import { readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  extensionManifest,
  extensionOutputDirectory,
  releaseArchiveName,
  releaseArchivePath,
  repositoryRoot,
} from './release-paths.mjs';

const run = (args, cwd) => {
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run([resolve(repositoryRoot, 'scripts/build.mjs')], repositoryRoot);
const outputDirectory = resolve(repositoryRoot, 'dist');
for (const file of await readdir(outputDirectory)) {
  if (
    file.startsWith(`${extensionManifest.name}-`) &&
    file.endsWith('.vsix') &&
    file !== releaseArchiveName
  )
    await rm(resolve(outputDirectory, file));
}
run(
  [
    resolve(repositoryRoot, 'node_modules/@vscode/vsce/vsce'),
    'package',
    '--no-dependencies',
    '--out',
    releaseArchivePath,
  ],
  extensionOutputDirectory,
);
