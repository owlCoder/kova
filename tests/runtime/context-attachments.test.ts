import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextAttachmentManager } from '../../packages/vscode/src/extension/ContextAttachmentManager.js';

const picker = vi.hoisted(() => ({ choose: vi.fn() }));
vi.mock('vscode', () => ({
  window: { showOpenDialog: picker.choose, activeTextEditor: undefined },
}));
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'kova-context-'));
  picker.choose.mockReset();
  await writeFile(join(directory, 'one.txt'), 'initial text');
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
describe('native editor attachment capture', () => {
  it('captures bounded text, refreshes it in place and clears attachments for a new conversation', async () => {
    picker.choose.mockResolvedValue([{ fsPath: join(directory, 'one.txt') }]);
    const manager = new ContextAttachmentManager(directory);
    await manager.add('PickFiles');
    const firstId = manager.list()[0]?.id;
    await writeFile(join(directory, 'one.txt'), 'updated text');
    await manager.add('PickFiles');
    expect(manager.list()).toHaveLength(1);
    expect(manager.list()[0]).toMatchObject({ id: firstId, content: 'updated text' });
    manager.clear();
    expect(manager.list()).toEqual([]);
  });
  it('does not retain a partial batch when a later file is binary or exceeds the byte limit', async () => {
    const manager = new ContextAttachmentManager(directory);
    await writeFile(join(directory, 'binary'), Buffer.from([0, 1, 2]));
    picker.choose.mockResolvedValue([
      { fsPath: join(directory, 'one.txt') },
      { fsPath: join(directory, 'binary') },
    ]);
    await expect(manager.add('PickFiles')).rejects.toThrow('Binary');
    expect(manager.list()).toEqual([]);
    await writeFile(join(directory, 'huge'), 'x'.repeat(100_001));
    picker.choose.mockResolvedValue([{ fsPath: join(directory, 'huge') }]);
    await expect(manager.add('PickFiles')).rejects.toThrow('100000 byte');
    expect(manager.list()).toEqual([]);
  });
  it('refuses a late picker result after conversation changes or generation starts', async () => {
    let finish: (files: { fsPath: string }[]) => void = () => {};
    picker.choose.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    let editable = true;
    const manager = new ContextAttachmentManager(directory, () => editable);
    const first = manager.add('PickFiles');
    manager.clear();
    finish([{ fsPath: join(directory, 'one.txt') }]);
    await expect(first).rejects.toThrow('Context changed');
    const second = manager.add('PickFiles');
    editable = false;
    finish([{ fsPath: join(directory, 'one.txt') }]);
    await expect(second).rejects.toThrow('Context changed');
    expect(manager.list()).toEqual([]);
  });
});
