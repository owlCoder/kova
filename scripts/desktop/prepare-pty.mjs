import { access, chmod, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const source = dirname(require.resolve('node-pty/package.json'));
const platform = `${process.platform}-${process.arch}`;

export async function preparePty(output) {
  const binary = process.platform === 'win32' ? 'conpty.node' : 'pty.node';
  let native = resolve(source, 'prebuilds', platform);
  try {
    await access(resolve(native, binary));
  } catch {
    // Linux is built by node-gyp during npm install; its N-API binary is portable to Electron.
    native = resolve(source, 'build/Release');
    await access(resolve(native, binary));
  }
  // The published spawn-helper lacks its executable bit on some npm installations.
  if (process.platform === 'darwin') await chmod(resolve(native, 'spawn-helper'), 0o755);
  if (!output) return;
  const destination = resolve(output, 'node_modules/node-pty');
  await mkdir(destination, { recursive: true });
  for (const file of ['lib', 'LICENSE'])
    await cp(resolve(source, file), resolve(destination, file), { recursive: true });
  await cp(native, resolve(destination, 'prebuilds', platform), {
    recursive: true,
  });
  const pkg = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'));
  // node-addon-api is a compile-time header dependency; shipped N-API binaries need no rebuild.
  await writeFile(
    resolve(destination, 'package.json'),
    JSON.stringify({ name: pkg.name, version: pkg.version, main: pkg.main, license: pkg.license }),
  );
}
