import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/** Collect main bundle inputs and the complete renderer dependency closure. */
export async function writeDependencyNotices(root, inputs, output) {
  const packages = new Map();
  const expanded = new Set();
  async function addFolder(folder, recurse = false) {
    const pkg = JSON.parse(await readFile(resolve(folder, 'package.json'), 'utf8'));
    const key = `${pkg.name}@${pkg.version}`;
    if (!pkg.name || !pkg.version)
      throw Object.assign(new Error('Not a package root'), { code: 'ENOENT' });
    if (pkg.name.startsWith('@kova/')) return;
    packages.set(key, folder);
    if (recurse && !expanded.has(key)) {
      expanded.add(key);
      for (const dependency of Object.keys(pkg.dependencies ?? {})) {
        let base = folder;
        while (true) {
          try {
            await addFolder(resolve(base, 'node_modules', dependency), true);
            break;
          } catch (error) {
            if (error.code !== 'ENOENT' || base === dirname(base)) throw error;
          }
          base = dirname(base);
        }
      }
    }
  }
  for (const input of inputs.filter((file) => file.includes('node_modules/'))) {
    let folder = dirname(resolve(root, input));
    while (folder !== dirname(folder)) {
      try {
        await addFolder(folder);
        break;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      folder = dirname(folder);
    }
  }
  const ui = JSON.parse(await readFile(resolve(root, 'webview/package.json'), 'utf8'));
  for (const name of Object.keys(ui.dependencies))
    await addFolder(resolve(root, 'node_modules', name), true);
  const notices = [];
  for (const [name, folder] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
    const files = (await readdir(folder)).filter((file) =>
      /^(license|licence|copying)(?:\.|$)/i.test(file),
    );
    if (!files.length) throw new Error(`Missing license for bundled dependency ${name}`);
    notices.push(
      `${name}\n${(await Promise.all(files.map((file) => readFile(resolve(folder, file), 'utf8')))).join('\n')}`,
    );
  }
  await writeFile(output, notices.join('\n\n----------------------------------------\n\n'));
  return packages.size;
}
