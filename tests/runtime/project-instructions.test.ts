import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CancellationSource } from '../../packages/core/src/common/CancellationSource.js';
import { WorkspaceProjectInstructions } from '../../packages/vscode/src/adapters/WorkspaceProjectInstructions.js';

let root = '';
let outside = '';
let diagnostics: string[] = [];
const read = () =>
  new WorkspaceProjectInstructions(root, (message) => diagnostics.push(message)).read(
    root,
    new CancellationSource(),
  );

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kova-rules-'));
  outside = await mkdtemp(join(tmpdir(), 'kova-rules-outside-'));
  diagnostics = [];
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

describe('workspace AGENTS.md', () => {
  it('returns the trimmed project rules', async () => {
    await writeFile(join(root, 'AGENTS.md'), '\n# Rules\nRun the tests.\n');
    expect(await read()).toBe('# Rules\nRun the tests.');
    expect(diagnostics).toEqual([]);
  });
  it('treats a missing or empty file as no project rules, without a diagnostic', async () => {
    expect(await read()).toBeNull();
    await writeFile(join(root, 'AGENTS.md'), ' \n');
    expect(await read()).toBeNull();
    expect(diagnostics).toEqual([]);
  });
  it('skips an oversized file and reports why', async () => {
    await writeFile(join(root, 'AGENTS.md'), 'x'.repeat(16_001));
    expect(await read()).toBeNull();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toContain('16000 bytes');
  });
  it('does not follow a link that leaves the workspace', async () => {
    await writeFile(join(outside, 'secret.md'), 'OUTSIDE');
    await symlink(join(outside, 'secret.md'), join(root, 'AGENTS.md'));
    expect(await read()).toBeNull();
    expect(diagnostics).toHaveLength(1);
  });
});
