import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { inspectSource } from './inspectSource.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const packages = ['core', 'ollama', 'mcp', 'vscode', 'protocol', 'webview'] as const;
type Package = (typeof packages)[number];
const directory = (name: Package) =>
  resolve(root, name === 'webview' ? 'webview' : `packages/${name}`);
const allowed: Record<Package, readonly Package[]> = {
  core: [],
  ollama: ['core'],
  mcp: ['core'],
  vscode: ['core', 'ollama', 'mcp', 'protocol'],
  protocol: [],
  webview: ['protocol'],
};

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function owner(path: string): Package | undefined {
  return packages.find((name) => {
    const candidate = relative(directory(name), path);
    return (
      candidate === '' ||
      (!candidate.startsWith(`..${sep}`) && candidate !== '..' && !candidate.startsWith(sep))
    );
  });
}

describe('runtime package boundaries', () => {
  it('has six unique package identities and a zero-dependency Core', () => {
    const names = packages.map((name) => {
      const manifest = JSON.parse(readFileSync(resolve(directory(name), 'package.json'), 'utf8'));
      if (name === 'core') {
        for (const key of [
          'dependencies',
          'devDependencies',
          'peerDependencies',
          'optionalDependencies',
        ])
          expect(Object.keys(manifest[key] ?? {})).toEqual([]);
      }
      return manifest.name;
    });
    expect(new Set(names).size).toBe(packages.length);
    expect(names).toEqual(packages.map((name) => `@kova/${name}`));
  });

  for (const name of packages) {
    it(`${name} declares only allowed workspace dependencies`, () => {
      const manifest = JSON.parse(readFileSync(resolve(directory(name), 'package.json'), 'utf8'));
      const dependencies = Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.peerDependencies,
        ...manifest.optionalDependencies,
      });
      for (const dependency of dependencies.filter((value) => value.startsWith('@kova/'))) {
        expect(
          allowed[name].map((target) => `@kova/${target}`),
          dependency,
        ).toContain(dependency);
      }
    });

    it(`${name} imports only allowed runtime layers`, () => {
      for (const path of sources(resolve(directory(name), 'src'))) {
        const result = inspectSource(readFileSync(path, 'utf8'), path);
        expect(result.unresolvedModuleLoads, relative(root, path)).toEqual([]);
        for (const imported of result.imports) {
          const label = `${relative(root, path)} → ${imported.specifier}`;
          if (imported.specifier.startsWith('.')) {
            const importedPath = resolve(dirname(path), imported.specifier);
            const assetRelative = relative(resolve(root, 'assets'), importedPath);
            if (
              name === 'webview' &&
              /\.png$/.test(importedPath) &&
              !assetRelative.startsWith('..') &&
              !assetRelative.startsWith(sep)
            ) {
              expect(existsSync(importedPath), label).toBe(true);
              continue;
            }
            const target = owner(importedPath);
            expect(target, label).toBeDefined();
            if (target !== name) expect(allowed[name], label).toContain(target);
          } else if (imported.specifier.startsWith('@kova/')) {
            expect(
              allowed[name].map((target) => `@kova/${target}`),
              label,
            ).toContain(imported.specifier.split('/').slice(0, 2).join('/'));
          } else {
            if (name === 'core' || name === 'protocol')
              expect.fail(`${label}: external dependency in isolated package`);
            if (name === 'webview')
              expect(imported.specifier, label).not.toMatch(
                /^(node:|vscode$|@modelcontextprotocol\/|ollama$)/,
              );
            if (name === 'ollama' || name === 'mcp')
              expect(imported.specifier, label).not.toMatch(/^(vscode$|react(?:\/|$))/);
          }
          if (name === 'protocol') {
            expect(imported.typeOnly, label).toBe(true);
            if (imported.specifier.startsWith('.')) {
              const targetPath = resolve(dirname(path), imported.specifier).replace(/\.js$/, '.ts');
              const target = inspectSource(readFileSync(targetPath, 'utf8'), targetPath);
              expect(target.exportedBehavior, `${label}: protocol imports behavior`).toEqual([]);
              expect(target.callableDataAliases, label).toEqual([]);
            }
          }
        }
      }
    });
  }

  it('Core compiler uses no Node or DOM ambient types', () => {
    const config = JSON.parse(readFileSync(resolve(directory('core'), 'tsconfig.json'), 'utf8'));
    expect(config.compilerOptions.types).toEqual([]);
    expect(config.compilerOptions.lib).toEqual(['ES2022']);
  });

  it('protocol contains only data contracts', () => {
    for (const path of sources(resolve(directory('protocol'), 'src'))) {
      const result = inspectSource(readFileSync(path, 'utf8'), path);
      expect(result.exportedBehavior, path).toEqual([]);
      expect(result.executableStatements, path).toEqual([]);
      expect(result.callableDataAliases, path).toEqual([]);
    }
  });

  it('one public class or behavioral interface per source file', () => {
    for (const name of packages) {
      for (const path of sources(resolve(directory(name), 'src'))) {
        const result = inspectSource(readFileSync(path, 'utf8'), path);
        expect(
          result.exportedBehavior.length,
          `${relative(root, path)}: ${result.exportedBehavior.join(', ')}`,
        ).toBeLessThanOrEqual(1);
        expect(result.callableDataAliases, path).toEqual([]);
      }
    }
  });
});

describe('architecture inspection regression cases', () => {
  it.each([
    ['import * as vscode from "vscode";', 'vscode', false],
    ['export { x } from "../ollama/index.js";', '../ollama/index.js', false],
    ['const p = import("node:child_process");', 'node:child_process', false],
    ['const p = require("node:fs");', 'node:fs', false],
    ['import type { X } from "vscode";', 'vscode', true],
    ['type X = import("react").ReactNode;', 'react', true],
    ['import { type X } from "./data.js";', './data.js', true],
    ['export { type X } from "./data.js";', './data.js', true],
    ['import X = require("node:fs");', 'node:fs', false],
  ])('detects module load %s', (source, specifier, typeOnly) => {
    expect(inspectSource(source).imports).toContainEqual({ specifier, typeOnly });
  });

  it('rejects unverifiable computed imports', () => {
    expect(inspectSource('const p = import(providerName);').unresolvedModuleLoads).toHaveLength(1);
    expect(inspectSource('const p = require(providerName);').unresolvedModuleLoads).toHaveLength(1);
  });

  it('detects mixed type/value imports as runtime imports', () => {
    expect(
      inspectSource('import { type X, createClient } from "./adapter.js";').imports,
    ).toContainEqual({ specifier: './adapter.js', typeOnly: false });
  });

  it('detects an interface and implementation combined in one file', () => {
    expect(
      inspectSource(
        'export interface Port { run(): void } export class Adapter implements Port { run() {} }',
      ).exportedBehavior,
    ).toEqual(['Port', 'Adapter']);
  });

  it('allows cohesive data interfaces while detecting callable aliases', () => {
    const result = inspectSource(
      'export interface A { id: string } export type B = "x" | "y"; export type C = { run: () => void };',
    );
    expect(result.exportedBehavior).toEqual([]);
    expect(result.callableDataAliases).toEqual(['C']);
  });

  it('does not mistake comments or ordinary strings for imports', () => {
    expect(
      inspectSource('// import x from "vscode";\nconst message = "import x from react";').imports,
    ).toEqual([]);
  });
});
