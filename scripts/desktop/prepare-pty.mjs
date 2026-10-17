import { chmod, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const source = dirname(require.resolve('node-pty/package.json'));
const platform = `${process.platform}-${process.arch}`;

export async function preparePty(output) {
  // The published spawn-helper lacks its executable bit on some npm installations.
  if (process.platform !== 'win32')
    await chmod(resolve(source, 'prebuilds', platform, 'spawn-helper'), 0o755);
  if (!output) return;
  const destination = resolve(output, 'node_modules/node-pty');
  await mkdir(destination, { recursive: true });
  for (const file of ['lib', 'LICENSE'])
    await cp(resolve(source, file), resolve(destination, file), { recursive: true });
  await cp(resolve(source, 'prebuilds', platform), resolve(destination, 'prebuilds', platform), {
    recursive: true,
  });
  const pkg = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'));
  // node-addon-api is a compile-time header dependency; shipped N-API binaries need no rebuild.
  await writeFile(
    resolve(destination, 'package.json'),
    JSON.stringify({ name: pkg.name, version: pkg.version, main: pkg.main, license: pkg.license }),
  );
}
