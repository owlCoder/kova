import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deleted: string[] = [];
vi.mock('vscode', () => ({
  workspace: {
    fs: {
      delete: async (uri: { fsPath: string }) => {
        deleted.push(uri.fsPath);
        await rm(uri.fsPath, { force: true });
      },
    },
  },
  Uri: { file: (path: string) => ({ fsPath: path }) },
}));

import { RunChangeTracker, toolCallPaths } from '../../packages/vscode/src/extension/runChanges.js';

let parent: string, root: string;
beforeEach(async () => {
  parent = await mkdtemp(join(tmpdir(), 'kova-revert-'));
  root = join(parent, 'repo');
  await mkdir(root);
  await writeFile(join(root, 'tracked.txt'), 'original\n');
});
afterEach(async () => {
  deleted.length = 0;
  await rm(parent, { recursive: true, force: true });
});

describe('toolCallPaths', () => {
  it('extracts paths from write/edit calls and +++ headers from patches', () => {
    expect(toolCallPaths('write_file', { path: 'a/b.cs', content: 'x' })).toEqual(['a/b.cs']);
    expect(toolCallPaths('edit_file', { path: 'a.cs' })).toEqual(['a.cs']);
    expect(
      toolCallPaths('apply_patch', {
        patch: '--- a/x\n+++ b/x\n@@\n--- /dev/null\n+++ b/new/y.cs\n@@\n',
      }),
    ).toEqual(['x', 'new/y.cs']);
    expect(toolCallPaths('read_file', { path: 'a.cs' })).toEqual([]);
  });
});

describe('RunChangeTracker', () => {
  it('records successful write calls per run and exposes the latest completed run', async () => {
    const tracker = new RunChangeTracker(() => root);
    tracker.onToolRequested('r1', 'c1', 'write_file', { path: 'tracked.txt', content: 'changed' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    tracker.onToolCompleted('r1', 'c1', true);
    tracker.onToolRequested('r1', 'c2', 'write_file', { path: 'brand-new.txt', content: 'x' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    tracker.onToolCompleted('r1', 'c2', true);
    // A failed call must not be recorded.
    tracker.onToolRequested('r1', 'c3', 'write_file', { path: 'failed.txt', content: 'x' });
    tracker.onToolCompleted('r1', 'c3', false);
    tracker.onRunFinished('r1');
    expect(tracker.latest()?.runId).toBe('r1');
    expect(tracker.latest()?.files).toEqual([
      { path: 'tracked.txt', created: false },
      { path: 'brand-new.txt', created: true },
    ]);
    expect(tracker.filesFor('r1')).toHaveLength(2);
    expect(tracker.filesFor('nope')).toEqual([]);
  });

  it('reverts tracked files via git checkout and deletes files created by the run', async () => {
    await writeFile(join(root, 'tracked.txt'), 'changed by run\n');
    const tracker = new RunChangeTracker(() => root, {
      gitCheckout: async (_root, paths) => {
        for (const path of paths) await writeFile(join(root, path), 'original\n');
      },
    });
    tracker.onToolRequested('r1', 'c1', 'write_file', {
      path: 'tracked.txt',
      content: 'changed by run\n',
    });
    tracker.onToolRequested('r1', 'c2', 'write_file', {
      path: 'brand-new.txt',
      content: 'created by run\n',
    });
    // Let the tracker record existence first, then simulate the tool writing the new file.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await writeFile(join(root, 'brand-new.txt'), 'created by run\n');
    tracker.onToolCompleted('r1', 'c1', true);
    tracker.onToolCompleted('r1', 'c2', true);
    tracker.onRunFinished('r1');
    const summary = await tracker.revert('r1', async () => true);
    expect(summary).toContain('Reverted 2 files');
    expect(await readFile(join(root, 'tracked.txt'), 'utf8')).toBe('original\n');
    expect(deleted.some((path) => path.endsWith('brand-new.txt'))).toBe(true);
    expect(tracker.latest()).toBeNull();
  });

  it('does nothing when the user cancels the confirmation', async () => {
    const tracker = new RunChangeTracker(() => root);
    tracker.onToolRequested('r1', 'c1', 'write_file', { path: 'tracked.txt', content: 'x' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    tracker.onToolCompleted('r1', 'c1', true);
    tracker.onRunFinished('r1');
    const summary = await tracker.revert('r1', async () => false);
    expect(summary).toBe('Revert cancelled.');
    expect(tracker.latest()?.runId).toBe('r1');
  });

  it('rejects paths outside the workspace root', async () => {
    const tracker = new RunChangeTracker(() => root);
    tracker.onToolRequested('r1', 'c1', 'write_file', { path: '../evil.txt', content: 'x' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    tracker.onToolCompleted('r1', 'c1', true);
    tracker.onRunFinished('r1');
    await expect(tracker.revert('r1', async () => true)).rejects.toThrow('outside');
  });
});
