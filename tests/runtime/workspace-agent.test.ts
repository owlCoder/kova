import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatAgent } from '../../packages/core/src/agents/ChatAgent.js';
import type { AgentEvent } from '../../packages/core/src/agents/AgentEvent.js';
import type { AgentRequest } from '../../packages/core/src/agents/AgentRequest.js';
import type { AgentMode } from '../../packages/core/src/agents/AgentMode.js';
import { InMemoryConversationRepository } from '../../packages/core/src/conversations/InMemoryConversationRepository.js';
import { TokenCounter } from '../../packages/core/src/context/TokenCounter.js';
import type { ApprovalPort } from '../../packages/core/src/permissions/ApprovalPort.js';
import type {
  ApprovalRequest,
  ApprovalResponse,
} from '../../packages/core/src/permissions/ApprovalRequest.js';
import type { ChatMessage } from '../../packages/core/src/providers/ChatMessage.js';
import type { ChatRequest } from '../../packages/core/src/providers/ChatRequest.js';
import type { LlmProvider } from '../../packages/core/src/providers/LlmProvider.js';
import type { ToolCallCandidate } from '../../packages/core/src/tools/ToolCallCandidate.js';
import { NodeWorkspaceRuntime } from '../../packages/runtime/src/adapters/NodeWorkspaceRuntime.js';
import { CancellationSource, EventLog } from './helpers.js';
import { chatText } from '../../packages/core/src/providers/chatText.js';

let parent: string, root: string;
beforeEach(async () => {
  parent = await mkdtemp(join(tmpdir(), 'kova-agent-'));
  root = join(parent, 'workspace');
  await mkdir(root);
  await writeFile(join(parent, 'seed.txt'), 'seed');
});
afterEach(async () => {
  await rm(parent, { recursive: true, force: true });
});

class ScriptedApproval implements ApprovalPort {
  readonly requests: ApprovalRequest[] = [];
  constructor(private readonly decision: 'AllowOnce' | 'Reject') {}
  request(request: ApprovalRequest): Promise<ApprovalResponse> {
    this.requests.push(request);
    return Promise.resolve({
      approvalId: request.approvalId,
      preparationKey: request.preparationKey,
      decision: this.decision,
    });
  }
}

/** Replays scripted tool calls per provider round and records every request. */
function scriptedProvider(rounds: readonly (readonly ToolCallCandidate[])[], seen: ChatRequest[]) {
  let index = 0;
  const provider: LlmProvider = {
    async *streamChat(request: ChatRequest) {
      seen.push(request);
      for (const call of rounds[index] ?? []) yield { type: 'ToolCallReady', candidate: call };
      index++;
      yield {
        type: 'Finished',
        reason: index <= rounds.length ? 'ToolCalls' : 'Complete',
        usage: null,
      };
    },
  };
  return provider;
}

const candidate = (name: string, args: ToolCallCandidate['arguments']): ToolCallCandidate => ({
  id: `call-${name}`,
  name,
  arguments: args,
});

function makeRequest(mode: AgentMode, prompt: string): AgentRequest {
  return {
    runId: `run-${mode}-${prompt.length}`,
    conversationId: 'chat',
    workspaceId: root,
    prompt,
    modelId: 'fixture',
    mode,
    activeSkillId: null,
    context: {
      maxTokens: 32768,
      reservedOutputTokens: 1024,
      safetyMarginRatio: 0.1,
      maxToolOutputCharacters: 8000,
    },
    attachments: [],
    thinkingEnabled: false,
    keepAliveSeconds: 0,
    toolsEnabled: true,
    imagesSupported: true,
    maxToolIterations: 10,
    commandAllowlist: [],
    testCommand: '',
  };
}

async function runAgent(
  mode: AgentMode,
  rounds: readonly (readonly ToolCallCandidate[])[],
  approval: ApprovalPort,
) {
  const seen: ChatRequest[] = [];
  const events = new EventLog();
  const repository = new InMemoryConversationRepository();
  const runtime = new NodeWorkspaceRuntime(root, approval, events);
  const agent = new ChatAgent(
    scriptedProvider(rounds, seen),
    repository,
    new TokenCounter(),
    runtime,
    null,
    null,
  );
  const cancellation = new CancellationSource();
  const outcome = await agent.run(makeRequest(mode, 'write class User'), cancellation, events);
  await runtime.dispose();
  return { seen, events, repository, outcome };
}

const toolResults = async (repository: InMemoryConversationRepository) =>
  (await repository.get('chat'))!.entries.filter((entry) => entry.message.role === 'tool');

describe('workspace agent end to end', () => {
  it('creates Domain/User.cs and edits it through write_file/edit_file like a coding harness', async () => {
    const created = [
      'namespace Domain;',
      'public class User',
      '{',
      '    public string Name { get; set; }',
      '}',
    ].join('\n');
    const { seen, events, repository, outcome } = await runAgent(
      'Edit',
      [
        [candidate('write_file', { path: 'Domain/User.cs', content: created + '\n' })],
        [
          candidate('edit_file', {
            path: 'Domain/User.cs',
            old_string: 'public string Name { get; set; }',
            new_string: 'public string Name { get; set; } = string.Empty;',
          }),
        ],
        [],
      ],
      new ScriptedApproval('AllowOnce'),
    );
    expect(outcome.status).toBe('Completed');
    const onDisk = await readFile(join(root, 'Domain', 'User.cs'), 'utf8');
    expect(onDisk).toBe(
      created.replace(
        'public string Name { get; set; }',
        'public string Name { get; set; } = string.Empty;',
      ) + '\n',
    );
    // The model was told which folder is open and which tools exist.
    const system = seen[0]?.messages[0] as ChatMessage;
    expect(system.role).toBe('system');
    expect(system.content).toContain(root);
    expect(system.content).toContain('write_file');
    expect(seen[0]?.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['read_file', 'write_file', 'edit_file', 'list_directory']),
    );
    // Tool calls and results are paired in the stored conversation.
    const results = await toolResults(repository);
    expect(results).toHaveLength(2);
    for (const result of results) {
      const content = JSON.parse(chatText(result.message.content)) as { status: string };
      expect(content.status).toBe('Success');
    }
    expect(events.events.some((event: AgentEvent) => event.type === 'ToolRequested')).toBe(true);
    expect(events.events.some((event: AgentEvent) => event.type === 'ToolCompleted')).toBe(true);
  });

  it('publishes a plan via update_todos without approval in any mode', async () => {
    const { events, repository, outcome } = await runAgent(
      'Manual',
      [
        [
          candidate('update_todos', {
            todos: [
              { content: 'Read existing code', status: 'in_progress' },
              { content: 'Write Domain/User.cs', status: 'pending' },
            ],
          }),
          candidate('write_file', { path: 'Domain/User.cs', content: 'class User {}\n' }),
        ],
        [
          candidate('update_todos', {
            todos: [
              { content: 'Read existing code', status: 'completed' },
              { content: 'Write Domain/User.cs', status: 'completed' },
            ],
          }),
        ],
        [],
      ],
      new ScriptedApproval('AllowOnce'),
    );
    expect(outcome.status).toBe('Completed');
    const updates = events.events.filter((event: AgentEvent) => event.type === 'TodosUpdated');
    expect(updates).toHaveLength(2);
    if (updates[0]?.type === 'TodosUpdated')
      expect(updates[0].todos.map((todo) => todo.status)).toEqual(['in_progress', 'pending']);
    expect(await readFile(join(root, 'Domain', 'User.cs'), 'utf8')).toBe('class User {}\n');
    const results = await toolResults(repository);
    expect(results).toHaveLength(3);
  });

  it('asks for approval in Manual mode and writes only after AllowOnce', async () => {
    const approval = new ScriptedApproval('AllowOnce');
    const { events, repository, outcome } = await runAgent(
      'Manual',
      [[candidate('write_file', { path: 'Notes/todo.md', content: '# todo\n' })], []],
      approval,
    );
    expect(outcome.status).toBe('Completed');
    expect(approval.requests).toHaveLength(1);
    expect(approval.requests[0]?.call.name).toBe('write_file');
    expect(approval.requests[0]?.preview?.kind).toBe('FileChanges');
    expect(events.events.some((event: AgentEvent) => event.type === 'ToolAwaitingApproval')).toBe(
      true,
    );
    expect(await readFile(join(root, 'Notes', 'todo.md'), 'utf8')).toBe('# todo\n');
    const results = await toolResults(repository);
    expect(JSON.parse(chatText(results[0]!.message.content)).status).toBe('Success');
  });

  it('writes nothing when the approval is rejected in Manual mode', async () => {
    const approval = new ScriptedApproval('Reject');
    const { events, repository, outcome } = await runAgent(
      'Manual',
      [[candidate('write_file', { path: 'Notes/todo.md', content: '# todo\n' })], []],
      approval,
    );
    expect(outcome.status).toBe('Completed');
    expect(approval.requests).toHaveLength(1);
    expect(events.events.some((event: AgentEvent) => event.type === 'ToolDenied')).toBe(true);
    await expect(readFile(join(root, 'Notes', 'todo.md'), 'utf8')).rejects.toThrow();
    const results = await toolResults(repository);
    expect(JSON.parse(chatText(results[0]!.message.content)).status).toBe('Denied');
  });

  it('refuses writes outside the workspace root even in Edit mode', async () => {
    const approval = new ScriptedApproval('AllowOnce');
    const { repository, outcome } = await runAgent(
      'Edit',
      [[candidate('write_file', { path: '../evil.txt', content: 'nope' })], []],
      approval,
    );
    expect(outcome.status).toBe('Completed');
    expect(approval.requests).toHaveLength(0);
    await expect(readFile(join(parent, 'evil.txt'), 'utf8')).rejects.toThrow();
    const results = await toolResults(repository);
    expect(JSON.parse(chatText(results[0]!.message.content)).status).toBe('Error');
  });

  it('exposes only read tools in Plan mode', async () => {
    const approval = new ScriptedApproval('AllowOnce');
    const { seen, repository } = await runAgent(
      'Plan',
      [[candidate('write_file', { path: 'Domain/User.cs', content: 'x' })], []],
      approval,
    );
    expect(seen[0]?.tools.every((tool) => !['write_file', 'edit_file'].includes(tool.name))).toBe(
      true,
    );
    expect(approval.requests).toHaveLength(0);
    await expect(readFile(join(root, 'Domain', 'User.cs'), 'utf8')).rejects.toThrow();
    // write_file is not even a known tool in Plan mode: the loop records a
    // structured repair message and never executes anything.
    expect(await toolResults(repository)).toHaveLength(0);
    const repairs = (await repository.get('chat'))!.entries.filter((entry) =>
      entry.id.endsWith('-repair'),
    );
    expect(repairs).toHaveLength(1);
    expect(JSON.parse(chatText(repairs[0]!.message.content)).toolError.code).toBe(
      'InvalidArguments',
    );
  });
});
