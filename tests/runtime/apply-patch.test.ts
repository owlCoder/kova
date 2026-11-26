import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NodeWorkspacePathGuard } from '../../packages/runtime/src/adapters/NodeWorkspacePathGuard.js';
import { NodeWorkspaceReader } from '../../packages/runtime/src/adapters/NodeWorkspaceReader.js';
import { NodeWorkspaceWriter } from '../../packages/runtime/src/adapters/NodeWorkspaceWriter.js';
import { ApplyPatchTool } from '../../packages/runtime/src/tools/ApplyPatchTool.js';
import { applyHunks, parseUnifiedPatch } from '../../packages/runtime/src/tools/unifiedPatch.js';
import type { ToolCall } from '../../packages/core/src/tools/ToolCall.js';
import { CancellationSource } from './helpers.js';

let parent: string, root: string;
const cancel = new CancellationSource();
beforeEach(async () => {
  parent = await mkdtemp(join(tmpdir(), 'kova-patch-'));
  root = join(parent, 'workspace');
  await mkdir(root);
});
afterEach(async () => {
  await rm(parent, { recursive: true, force: true });
});

const call = (patch: string): ToolCall => ({
  id: 'call',
  name: 'apply_patch',
  arguments: { patch },
});
const tool = () =>
  new ApplyPatchTool(
    new NodeWorkspacePathGuard(root),
    new NodeWorkspaceReader(new NodeWorkspacePathGuard(root)),
    new NodeWorkspaceWriter(new NodeWorkspacePathGuard(root)),
  );
const run = async (patch: string) => {
  const t = tool();
  const prepared = await t.prepare(call(patch), root, cancel);
  if (prepared.status === 'Error') return prepared.result;
  return t.execute(prepared.prepared, cancel);
};

describe('unifiedPatch parser and applier', () => {
  it('applies a multi-hunk patch to existing content', () => {
    const before = 'line1\nline2\nline3\nline4\nline5\n';
    const patch = [
      '--- a/file.txt',
      '+++ b/file.txt',
      '@@ -1,3 +1,3 @@',
      ' line1',
      '-line2',
      '+line2 changed',
      ' line3',
      '@@ -4,2 +4,3 @@',
      ' line4',
      '+line4 inserted',
      ' line5',
    ].join('\n');
    const files = parseUnifiedPatch(patch);
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe('file.txt');
    expect(applyHunks(before, files[0]!.hunks)).toBe(
      'line1\nline2 changed\nline3\nline4\nline4 inserted\nline5\n',
    );
  });

  it('creates a new file from a create patch', () => {
    const patch = [
      '--- /dev/null',
      '+++ b/new/deep/file.cs',
      '@@ -0,0 +1,2 @@',
      '+namespace A;',
      '+class B {}',
    ].join('\n');
    const files = parseUnifiedPatch(patch);
    expect(applyHunks('', files[0]!.hunks)).toBe('namespace A;\nclass B {}');
  });

  it('rejects mismatched context and malformed hunks', () => {
    const patch = [
      '--- a/f.txt',
      '+++ b/f.txt',
      '@@ -1,2 +1,2 @@',
      ' wrong',
      '-context',
      '+x',
    ].join('\n');
    const files = parseUnifiedPatch(patch);
    expect(() => applyHunks('actual\ncontext\n', files[0]!.hunks)).toThrow('PatchMismatch');
    expect(() => parseUnifiedPatch('--- a/f\n+++ b/f\n@@ -1,5 +1,5 @@\n a\n b\n')).toThrow(
      'counts',
    );
    expect(() => parseUnifiedPatch('no files here')).toThrow('no file sections');
    expect(() => parseUnifiedPatch('--- a/f\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n')).toThrow(
      'Deleting whole files',
    );
  });

  it('enforces size limits', () => {
    const huge = `--- a/f\n+++ b/f\n@@ -1,1 +1,${'1'.repeat(0)} @@\n`;
    expect(() => parseUnifiedPatch('x'.repeat(300 * 1024))).toThrow('characters');
    expect(() => parseUnifiedPatch(huge + 'a\n'.repeat(30000))).toThrow();
  });
});

describe('apply_patch tool', () => {
  it('creates and modifies multiple files through one call', async () => {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src', 'a.txt'), 'alpha\nbeta\n');
    const patch = [
      'diff --git a/src/a.txt b/src/a.txt',
      '--- a/src/a.txt',
      '+++ b/src/a.txt',
      '@@ -1,2 +1,2 @@',
      ' alpha',
      '-beta',
      '+BETA',
      '--- /dev/null',
      '+++ b/src/b.txt',
      '@@ -0,0 +1,1 @@',
      '+brand new',
    ].join('\n');
    const result = await run(patch);
    expect(result.status).toBe('Success');
    expect(await readFile(join(root, 'src', 'a.txt'), 'utf8')).toBe('alpha\nBETA\n');
    expect(await readFile(join(root, 'src', 'b.txt'), 'utf8')).toBe('brand new');
  });

  it('prepares a before/after preview with resolved in-root paths only', async () => {
    const t = tool();
    const prepared = await t.prepare(
      call('--- /dev/null\n+++ b/ok.txt\n@@ -0,0 +1,1 @@\n+hi\n'),
      root,
      cancel,
    );
    expect(prepared.status).toBe('Ready');
    if (prepared.status === 'Ready') {
      expect(prepared.prepared.preview?.kind).toBe('FileChanges');
      expect(prepared.prepared.paths[0]?.path.relativePath).toBe('ok.txt');
    }
    const outside = await t.prepare(
      call('--- /dev/null\n+++ b/../evil.txt\n@@ -0,0 +1,1 @@\n+x\n'),
      root,
      cancel,
    );
    expect(outside.status).toBe('Error');
  });

  it('fails without touching disk when a hunk does not match', async () => {
    await writeFile(join(root, 'f.txt'), 'real\n');
    const result = await run('--- a/f.txt\n+++ b/f.txt\n@@ -1,1 +1,1 @@\n-wrong\n+x\n');
    expect(result.status).toBe('Error');
    expect(result.error?.code).toBe('PatchMismatch');
    expect(await readFile(join(root, 'f.txt'), 'utf8')).toBe('real\n');
  });

  it('rejects a create patch for an existing file', async () => {
    await writeFile(join(root, 'f.txt'), 'real\n');
    const result = await run('--- /dev/null\n+++ b/f.txt\n@@ -0,0 +1,1 @@\n+x\n');
    expect(result.status).toBe('Error');
    expect(result.error?.code).toBe('FileExists');
  });
});
