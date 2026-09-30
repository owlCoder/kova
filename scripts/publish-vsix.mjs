import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { releaseArchivePath, repositoryRoot } from './release-paths.mjs';

if (!process.env.VSCE_PAT)
  throw new Error(
    'VSCE_PAT is required to publish. Store it in the environment or a GitHub Actions secret.',
  );

const runNode = (script) => {
  const result = spawnSync(process.execPath, [resolve(repositoryRoot, script)], {
    cwd: repositoryRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

runNode('scripts/package.mjs');
runNode('scripts/verify-package.mjs');

const vsce = resolve(repositoryRoot, 'node_modules/@vscode/vsce/vsce');
const publish = spawnSync(
  process.execPath,
  [vsce, 'publish', '--packagePath', releaseArchivePath],
  {
    cwd: repositoryRoot,
    stdio: 'inherit',
    env: process.env,
  },
);
if (publish.error) throw publish.error;
if (publish.status !== 0) process.exit(publish.status ?? 1);
