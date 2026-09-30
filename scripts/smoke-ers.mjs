import { build } from 'esbuild';
import { spawn } from 'node:child_process';
await build({
  entryPoints: ['tests/smoke/ers.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/tests/ers.mjs',
  packages: 'external',
});
const child = spawn(process.execPath, ['dist/tests/ers.mjs'], { stdio: 'inherit' });
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
