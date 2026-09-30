import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NodeWorkspacePathGuard } from '../../packages/vscode/src/adapters/NodeWorkspacePathGuard.js';
import { NodeWorkspaceReader } from '../../packages/vscode/src/adapters/NodeWorkspaceReader.js';
import { NodeWorkspaceSearch } from '../../packages/vscode/src/adapters/NodeWorkspaceSearch.js';
import { ReadFileTool } from '../../packages/vscode/src/tools/ReadFileTool.js';
import { ListDirectoryTool } from '../../packages/vscode/src/tools/ListDirectoryTool.js';
import { SearchFilesTool } from '../../packages/vscode/src/tools/SearchFilesTool.js';
import { EditFileTool } from '../../packages/vscode/src/tools/EditFileTool.js';
import { WriteFileTool } from '../../packages/vscode/src/tools/WriteFileTool.js';
import type { WorkspaceWriter } from '../../packages/core/src/workspace/WorkspaceWriter.js';
import type { Tool } from '../../packages/core/src/tools/Tool.js';
import type { ToolCall } from '../../packages/core/src/tools/ToolCall.js';
import { CancellationSource } from './helpers.js';

let parent: string, root: string, guard: NodeWorkspacePathGuard, reader: NodeWorkspaceReader;
const cancel = new CancellationSource();
beforeEach(async () => {
  parent = await mkdtemp(join(tmpdir(), 'kova-path-'));
  root = join(parent, 'workspace');
  await mkdir(root);
  guard = new NodeWorkspacePathGuard(root);
  reader = new NodeWorkspaceReader(guard);
});
afterEach(async () => {
  await rm(parent, { recursive: true, force: true });
});
const call = (name: string, args: ToolCall['arguments']): ToolCall => ({
  id: 'call',
  name,
  arguments: args,
});
const run = async (tool: Tool, args: ToolCall['arguments']) => {
  const result = await tool.prepare(call(tool.definition.name, args), root, cancel);
  if (result.status === 'Error') return result.result;
  return tool.execute(result.prepared, cancel);
};
const writer = (): WorkspaceWriter => ({
  replace: async (path, content, expectedVersion, cancellation) => {
    const current = await guard.resolve(root, path.relativePath, 'Write', cancellation);
    const actual = current.exists
      ? createHash('sha256')
          .update(await readFile(current.canonicalPath, 'utf8'))
          .digest('hex')
      : null;
    if (actual !== expectedVersion || current.canonicalPath !== path.canonicalPath)
      return { status: 'Error', code: 'StaleContent', message: 'stale' };
    await writeFile(current.canonicalPath, content);
    return { status: 'Applied', version: createHash('sha256').update(content).digest('hex') };
  },
});

describe('workspace path containment', () => {
  it('accepts absolute paths inside the workspace', async () => {
    await writeFile(join(root, 'inside.txt'), 'safe');
    expect((await guard.resolve(root, join(root, 'inside.txt'), 'Read', cancel)).relativePath).toBe(
      'inside.txt',
    );
  });
  it('rejects traversal, absolute outside paths, drive letters and UNC roots', async () => {
    for (const path of ['../outside', join(parent, 'outside'), 'C:\\outside', '\\\\server\\share'])
      await expect(guard.resolve(root, path, 'Write', cancel)).rejects.toThrow('outside');
  });
  it('resolves missing descendants against nearest existing real parent', async () => {
    const resolved = await guard.resolve(root, 'new/deep/file.txt', 'Write', cancel);
    expect(resolved.exists).toBe(false);
    expect(resolved.canonicalPath).toBe(join(await realpath(root), 'new/deep/file.txt'));
  });
  it('rejects both existing and missing targets through an outside symlink', async () => {
    await writeFile(join(parent, 'secret'), 'secret');
    await symlink(parent, join(root, 'escape'));
    await expect(guard.resolve(root, 'escape/secret', 'Read', cancel)).rejects.toThrow('outside');
    await expect(guard.resolve(root, 'escape/new', 'Write', cancel)).rejects.toThrow('outside');
  });
  it('rejects a case-only sibling reached through a symlink on case-sensitive volumes', async () => {
    const sibling = join(parent, 'WORKSPACE');
    await mkdir(sibling, { recursive: true });
    if ((await realpath(sibling)) === (await realpath(root))) return;
    await writeFile(join(sibling, 'secret'), 'outside');
    await symlink(sibling, join(root, 'case-escape'));
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    try {
      await expect(guard.resolve(root, 'case-escape/secret', 'Read', cancel)).rejects.toThrow(
        'outside',
      );
    } finally {
      Object.defineProperty(process, 'platform', descriptor);
    }
  });
  it('rejects dangling symlinks when preparing a new write', async () => {
    await symlink(join(parent, 'missing'), join(root, 'dangling'));
    await expect(guard.resolve(root, 'dangling', 'Write', cancel)).rejects.toThrow('Dangling');
  });
  it('protects executable configuration aliases and real targets', async () => {
    await mkdir(join(root, '.git'));
    await writeFile(join(root, '.git', 'config'), 'x');
    await symlink(join(root, '.git'), join(root, 'alias'));
    expect((await guard.resolve(root, 'alias/config', 'Write', cancel)).protected).toBe(true);
    for (const path of ['.kova/mcp.json', '.kova/hooks.json', '.git/new', '.vscode/tasks.json'])
      expect((await guard.resolve(root, path, 'Write', cancel)).protected).toBe(true);
    expect(
      (await guard.resolve(root, '.kova/skills/demo/SKILL.md', 'Write', cancel)).protected,
    ).toBe(false);
  });
});

describe('built-in workspace tools', () => {
  it('reads one-based line ranges and lists direct children', async () => {
    await writeFile(join(root, 'a.txt'), 'one\ntwo\nthree');
    expect(
      (await run(new ReadFileTool(guard, reader), { path: 'a.txt', start_line: 2, end_line: 2 }))
        .output,
    ).toBe('two');
    expect((await run(new ListDirectoryTool(guard, reader), {})).output).toBe('File\ta.txt');
    expect(
      (await run(new ReadFileTool(guard, reader), { path: 'a.txt', start_line: 3, end_line: 2 }))
        .status,
    ).toBe('Error');
  });
  it('caps search results, applies glob and excludes outside symlinks', async () => {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src', 'a.ts'), 'target\ntarget');
    await writeFile(join(root, 'a.md'), 'target');
    await writeFile(join(parent, 'secret.ts'), 'target');
    await symlink(parent, join(root, 'escape'));
    const output = await run(new SearchFilesTool(new NodeWorkspaceSearch(guard)), {
      query: 'target',
      glob: '**/*.ts',
      max_results: 1,
    });
    expect(output.output).toBe('src/a.ts:1: target');
  });
  it('requires one exact edit match and returns matchCount without changing content', async () => {
    await writeFile(join(root, 'a.txt'), 'same same');
    const tool = new EditFileTool(guard, reader, writer());
    for (const [old_string, count] of [
      ['missing', 0],
      ['same', 2],
    ] as const) {
      const result = await run(tool, { path: 'a.txt', old_string, new_string: 'new' });
      expect(result.error?.details.matchCount).toBe(count);
      expect(await readFile(join(root, 'a.txt'), 'utf8')).toBe('same same');
    }
  });
  it('prepares its own before/after preview and rejects a stale write', async () => {
    await writeFile(join(root, 'a.txt'), 'before');
    const tool = new EditFileTool(guard, reader, writer());
    const result = await tool.prepare(
      call('edit_file', { path: 'a.txt', old_string: 'before', new_string: 'after' }),
      root,
      cancel,
    );
    expect(result.status).toBe('Ready');
    if (result.status !== 'Ready') throw new Error('prepare failed');
    expect(result.prepared.preview).toEqual(
      expect.objectContaining({
        kind: 'FileChanges',
        changes: [expect.objectContaining({ beforeContent: 'before', afterContent: 'after' })],
      }),
    );
    await writeFile(join(root, 'a.txt'), 'user change');
    expect((await tool.execute(result.prepared, cancel)).error?.code).toBe('StaleContent');
    expect(await readFile(join(root, 'a.txt'), 'utf8')).toBe('user change');
  });
  it('creates a missing file and replaces one exact match, preserving literal dollar replacements', async () => {
    const write = new WriteFileTool(guard, reader, writer());
    expect((await run(write, { path: 'a.txt', content: 'one' })).status).toBe('Success');
    expect(
      (
        await run(new EditFileTool(guard, reader, writer()), {
          path: 'a.txt',
          old_string: 'one',
          new_string: '$&',
        })
      ).status,
    ).toBe('Success');
    expect(await readFile(join(root, 'a.txt'), 'utf8')).toBe('$&');
  });
  it('rejects oversized and binary files before returning unbounded text', async () => {
    await writeFile(join(root, 'huge.txt'), 'x'.repeat(2 * 1024 * 1024 + 1));
    const huge = await run(new ReadFileTool(guard, reader), { path: 'huge.txt' });
    expect(huge.status).toBe('Error');
    expect(huge.error?.message).toContain('2 MiB');
    await writeFile(join(root, 'binary.dat'), Buffer.from([1, 0, 2]));
    const binary = await run(new ReadFileTool(guard, reader), { path: 'binary.dat' });
    expect(binary.error?.message).toContain('Binary');
  });
  it('bounds the UI output and indicates how much was omitted', async () => {
    await writeFile(join(root, 'large.txt'), 'a'.repeat(40000));
    const result = await run(new ReadFileTool(guard, reader), { path: 'large.txt' });
    expect(result.output.length).toBeLessThanOrEqual(30000);
    expect(result.omittedCharacters).toBeGreaterThan(0);
    expect(result.output).toContain('output truncated');
  });
});
