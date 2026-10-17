import { preparePty } from './prepare-pty.mjs';
import { createServer } from 'vite';
import { context } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
await preparePty();
const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, 'dist/desktop');
await mkdir(output, { recursive: true });
const manifest = JSON.parse(await readFile(resolve(root, 'packages/desktop/package.json'), 'utf8'));
await writeFile(
  output + '/package.json',
  JSON.stringify({ name: 'kova-desktop', version: manifest.version, main: 'main/main.cjs' }),
);
const server = await createServer({
  configFile: resolve(root, 'webview/vite.config.ts'),
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
});
await server.listen();
const require = createRequire(import.meta.url);
const electron = require('electron');
let child;
let restart = Promise.resolve();
let stopped = false;
const launch = () => {
  if (!stopped)
    child = spawn(electron, [output], {
      stdio: 'inherit',
      env: { ...process.env, KOVA_DESKTOP_DEV_URL: 'http://127.0.0.1:5175' },
    });
};
const options = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron', 'node-pty'],
  sourcemap: true,
};
const main = await context({
  ...options,
  entryPoints: {
    'main/main': resolve(root, 'packages/desktop/src/main/main.ts'),
    preload: resolve(root, 'packages/desktop/src/preload.ts'),
  },
  outdir: output,
  outExtension: { '.js': '.cjs' },
  plugins: [
    {
      name: 'restart-desktop',
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length) return;
          restart = restart.then(async () => {
            if (child && child.exitCode === null) {
              const exited = new Promise((resolve) => child.once('exit', resolve));
              child.kill('SIGTERM');
              await exited;
            }
            launch();
          });
        });
      },
    },
  ],
});
await main.watch();

console.log('Kova Desktop development server: http://127.0.0.1:5175');
async function stop() {
  stopped = true;
  child?.kill('SIGTERM');
  await main.dispose();
  await server.close();
}
process.on('SIGINT', () => {
  void stop().finally(() => process.exit());
});
process.on('SIGTERM', () => {
  void stop().finally(() => process.exit());
});
