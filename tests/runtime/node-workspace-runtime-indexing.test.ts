import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApprovalPort } from '../../packages/core/src/permissions/ApprovalPort.js';
import type { AgentEventSink } from '../../packages/core/src/agents/AgentEventSink.js';
import { NodeWorkspaceRuntime } from '../../packages/runtime/src/adapters/NodeWorkspaceRuntime.js';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'kova-runtime-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('NodeWorkspaceRuntime indexing opt-in', () => {
  // The constructor never calls approval or events, so empty fakes are enough here.
  const approval = {} as ApprovalPort;
  const sink: AgentEventSink = { emit() {} };

  it('has no index by default', () => {
    const runtime = new NodeWorkspaceRuntime(directory, approval, sink);
    expect(runtime.index).toBeNull();
  });

  it('creates an index only when indexing is enabled', () => {
    const off = new NodeWorkspaceRuntime(directory, approval, sink, [], undefined, false);
    const on = new NodeWorkspaceRuntime(directory, approval, sink, [], undefined, true);
    expect(off.index).toBeNull();
    expect(on.index).not.toBeNull();
  });
});
