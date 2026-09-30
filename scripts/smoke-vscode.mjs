import { build } from 'esbuild';
import { runTests } from '@vscode/test-electron';
import { resolve } from 'node:path';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { extensionManifest, releaseArchivePath } from './release-paths.mjs';

await build({
  entryPoints: ['tests/smoke/vscode.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
  outfile: 'dist/tests/vscode.cjs',
});
const isolated = await mkdtemp(resolve(tmpdir(), 'kova-vscode-'));
try {
  await mkdir(resolve(isolated, 'workspace'));
  await mkdir(resolve(isolated, 'profile/User'), { recursive: true });
  await writeFile(
    resolve(isolated, 'profile/User/settings.json'),
    JSON.stringify({
      'telemetry.telemetryLevel': 'off',
      'workbench.startupEditor': 'none',
      'chat.disableAIFeatures': true,
    }),
  );
  const executable =
    process.env.KOVA_VSCODE_EXECUTABLE ??
    '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
  let extensionPath = resolve('dist/extension');
  if (process.argv.includes('--vsix')) {
    const cli =
      process.env.KOVA_VSCODE_CLI ??
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code';
    const installed = await promisify(execFile)(cli, [
      '--user-data-dir',
      resolve(isolated, 'profile'),
      '--extensions-dir',
      resolve(isolated, 'extensions'),
      '--install-extension',
      releaseArchivePath,
    ]);
    console.log(installed.stdout.trim());
    const directory = (await readdir(resolve(isolated, 'extensions'))).find((name) =>
      name.startsWith(`${extensionManifest.publisher}.${extensionManifest.name}-`),
    );
    if (!directory) throw new Error('VSIX was not installed.');
    extensionPath = resolve(isolated, 'extensions', directory);
  }
  await runTests({
    vscodeExecutablePath: executable,
    extensionDevelopmentPath: extensionPath,
    extensionTestsPath: resolve('dist/tests/vscode.cjs'),
    launchArgs: [
      resolve(isolated, 'workspace'),
      '--user-data-dir',
      resolve(isolated, 'profile'),
      '--extensions-dir',
      resolve(isolated, 'extensions'),
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
    ],
  });
} finally {
  await rm(isolated, { recursive: true, force: true });
}
