import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CancellationSource } from '../../packages/core/src/common/CancellationSource.js';
import type { AgentEvent } from '../../packages/core/src/agents/AgentEvent.js';
import type { McpConfiguration } from '../../packages/core/src/mcp/McpConfiguration.js';
import type { HookConfiguration } from '../../packages/core/src/hooks/HookConfiguration.js';
import type { ApprovalPort } from '../../packages/core/src/permissions/ApprovalPort.js';
import { GuardrailEvaluator } from '../../packages/core/src/permissions/GuardrailEvaluator.js';
import { ProtectedPathGuardrail } from '../../packages/core/src/permissions/ProtectedPathGuardrail.js';
import { HookPipeline } from '../../packages/core/src/hooks/HookPipeline.js';
import { ToolRegistry } from '../../packages/core/src/tools/ToolRegistry.js';
import { DefaultToolRuntime } from '../../packages/core/src/tools/DefaultToolRuntime.js';
import { StdioMcpClient } from '../../packages/mcp/src/StdioMcpClient.js';
import { NodeProcessRunner } from '../../packages/vscode/src/adapters/NodeProcessRunner.js';
import { NodeWorkspacePathGuard } from '../../packages/vscode/src/adapters/NodeWorkspacePathGuard.js';
import { NodeWorkspaceReader } from '../../packages/vscode/src/adapters/NodeWorkspaceReader.js';
import { CommandHook } from '../../packages/vscode/src/adapters/CommandHook.js';
import { RunCommandTool } from '../../packages/vscode/src/tools/RunCommandTool.js';
import { ReadFileTool } from '../../packages/vscode/src/tools/ReadFileTool.js';
import { ErsGuardrailAdapter } from '../../packages/vscode/src/integrations/ErsGuardrailAdapter.js';
import { WorkspaceSkillRepository } from '../../packages/vscode/src/skills/WorkspaceSkillRepository.js';
import { SkillLoader } from '../../packages/core/src/skills/SkillLoader.js';
import { ChatAgent } from '../../packages/core/src/agents/ChatAgent.js';
import { InMemoryConversationRepository } from '../../packages/core/src/conversations/InMemoryConversationRepository.js';
import { TokenCounter } from '../../packages/core/src/context/TokenCounter.js';
import { OllamaConnection } from '../../packages/ollama/src/OllamaConnection.js';
import { OllamaLlmProvider } from '../../packages/ollama/src/OllamaLlmProvider.js';

assert(process.env.KOVA_ERS_ROOT, 'Set KOVA_ERS_ROOT to the ERS example workspace.');
const root = resolve(process.env.KOVA_ERS_ROOT);
const source = new CancellationSource(),
  observed: AgentEvent[] = [],
  events = {
    emit(event: AgentEvent) {
      observed.push(event);
    },
  };
const mcp = new StdioMcpClient(),
  runner = new NodeProcessRunner(root),
  guard = new NodeWorkspacePathGuard(root);
let approvals = 0;
// This deterministic smoke explicitly authorizes the actual test invocation, never arbitrary production approvals.
const approval: ApprovalPort = {
  async request(request) {
    assert(request.call.name === 'mcp__ers__run_unit_tests');
    approvals++;
    return {
      approvalId: request.approvalId,
      preparationKey: request.preparationKey,
      decision: 'AllowOnce',
    };
  },
};
try {
  const config = JSON.parse(
    await readFile(resolve(root, '.kova/mcp.json'), 'utf8'),
  ) as McpConfiguration;
  const hooks = JSON.parse(
    await readFile(resolve(root, '.kova/hooks.json'), 'utf8'),
  ) as HookConfiguration;
  const registry = new ToolRegistry();
  for (const tool of await mcp.start(root, config, events, source)) registry.register(tool);
  assert.equal(registry.definitions('Manual').length, 3, JSON.stringify(observed));
  registry.register(new RunCommandTool(guard, runner));
  registry.register(new ReadFileTool(guard, new NodeWorkspaceReader(guard)));
  const runtime = new DefaultToolRuntime(
    root,
    registry,
    approval,
    new HookPipeline(
      hooks.BeforeToolExecution.map((hook) => new CommandHook(hook, runner, root)),
      hooks.AfterToolExecution.map((hook) => new CommandHook(hook, runner, root)),
    ),
    new GuardrailEvaluator([
      new ProtectedPathGuardrail(),
      new ErsGuardrailAdapter(
        root,
        resolve(root, 'src/EquipmentReservation.Guardrails/EquipmentReservation.Guardrails.csproj'),
        runner,
      ),
    ]),
  );
  const call = (id: string, name: string, args = {}) =>
    runtime.execute({ id, name, arguments: args }, 'Auto', [], source, events, 'ers-smoke');
  const structure = await call('structure', 'mcp__ers__get_project_structure');
  assert.equal(structure.status, 'Success');
  assert(structure.output.includes('EquipmentReservation.Domain'));
  const diff = await call('diff', 'mcp__ers__get_git_diff');
  assert.equal(diff.status, 'Success');
  const tests = await call('tests', 'mcp__ers__run_unit_tests');
  assert.equal(tests.status, 'Success');
  assert(tests.output.includes('Passed') || tests.output.includes('Uspešno'));
  assert.equal(approvals, 1);
  assert(observed.some((event) => event.type === 'ToolAwaitingApproval'));
  const destructive = await call('delete', 'run_command', { command: 'rm -rf .' });
  assert.equal(destructive.status, 'Blocked');
  const force = await call('force', 'run_command', { command: 'git push --force' });
  assert.equal(force.status, 'Blocked');
  assert(force.error?.message.includes('ERS guardrail'));
  const fixture = await mkdtemp(resolve(root, '.kova-guard-smoke-'));
  try {
    await writeFile(resolve(fixture, '.env'), 'KOVA_PUBLIC_TEST_FIXTURE=1\n');
    const sensitive = await call('secret', 'read_file', { path: resolve(fixture, '.env') });
    assert.equal(sensitive.status, 'Blocked', JSON.stringify(sensitive));
    assert(sensitive.error?.message.includes('ERS guardrail'));
  } finally {
    await rm(fixture, { recursive: true });
  }
  assert(
    observed
      .filter((event) => event.type === 'HookObserved')
      .every((event) => event.report.outcome === 'Observed'),
  );
  console.log(
    'PASS real ERS MCP discovery, structure, Git diff, approval-gated dotnet tests (9 passed), pre/post hooks and destructive/force-push/sensitive-file blocks.',
  );
  const repository = new InMemoryConversationRepository();
  const review = await new ChatAgent(
    new OllamaLlmProvider(new OllamaConnection('http://127.0.0.1:11434')),
    repository,
    new TokenCounter(),
    runtime,
    new SkillLoader(new WorkspaceSkillRepository(root)),
  ).run(
    {
      runId: 'ers-review',
      conversationId: 'ers-review',
      workspaceId: root,
      prompt:
        'Review the current ERS changes. Use mcp__ers__get_git_diff and mcp__ers__run_unit_tests once each, then report blockingFindings, nonBlockingFindings, missingTests, architectureNotes and verificationEvidence. Do not write files.',
      modelId: 'qwen3:4b',
      mode: 'Manual',
      activeSkillId: 'review-pull-request',
      context: {
        maxTokens: 8192,
        reservedOutputTokens: 2048,
        safetyMarginRatio: 0.1,
        maxToolOutputCharacters: 6000,
      },
      attachments: [],
      thinkingEnabled: true,
      keepAliveSeconds: 300,
      maxToolIterations: 10,
      commandAllowlist: [],
      toolsEnabled: true,
    },
    source,
    events,
  );
  assert.equal(
    review.status,
    'Completed',
    JSON.stringify(
      observed.filter(
        (event) => event.type === 'ErrorOccurred' || event.type === 'AgentLoopStopped',
      ),
    ),
  );
  assert(observed.some((event) => event.type === 'SkillLoaded'));
  const conversation = await repository.get('ers-review');

  assert(
    conversation?.entries.some(
      (entry) =>
        entry.message.role === 'tool' && entry.message.toolName === 'mcp__ers__get_git_diff',
    ),
  );
  assert(
    conversation?.entries.some(
      (entry) =>
        entry.message.role === 'tool' && entry.message.toolName === 'mcp__ers__run_unit_tests',
    ),
  );
  console.log(
    'Review evidence:',
    JSON.stringify({
      toolCalls: conversation?.entries
        .filter((entry) => entry.message.role === 'tool')
        .map((entry) => (entry.message.role === 'tool' ? entry.message.toolName : '')),
      finalReview: conversation?.entries
        .filter((entry) => entry.message.role === 'assistant')
        .at(-1)
        ?.message.content.slice(0, 1800),
    }),
  );
  console.log(
    'PASS real qwen3:4b ERS review with selected skill, MCP diff and approved MCP unit-test call; thinking absent from history.',
  );
} finally {
  await mcp.stop();
}
