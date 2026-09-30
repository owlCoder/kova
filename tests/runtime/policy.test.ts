import { describe, expect, it, vi } from 'vitest';
import { CommandRiskClassifier } from '../../packages/core/src/permissions/CommandRiskClassifier.js';
import { PermissionPolicy } from '../../packages/core/src/permissions/PermissionPolicy.js';
import { GuardrailEvaluator } from '../../packages/core/src/permissions/GuardrailEvaluator.js';
import { ProtectedPathGuardrail } from '../../packages/core/src/permissions/ProtectedPathGuardrail.js';
import { DefaultToolRuntime } from '../../packages/core/src/tools/DefaultToolRuntime.js';
import { ToolRegistry } from '../../packages/core/src/tools/ToolRegistry.js';
import { HookPipeline } from '../../packages/core/src/hooks/HookPipeline.js';
import type { AgentMode } from '../../packages/core/src/agents/AgentMode.js';
import type { Hook } from '../../packages/core/src/hooks/Hook.js';
import type { RiskLevel } from '../../packages/core/src/permissions/RiskLevel.js';
import type { PreparedToolCall } from '../../packages/core/src/tools/PreparedToolCall.js';
import type { Tool } from '../../packages/core/src/tools/Tool.js';
import { CancellationSource, EventLog } from './helpers.js';

const classifier = new CommandRiskClassifier();
const prepared = (risk: RiskLevel, command: string | null = null): PreparedToolCall => ({
  call: { id: 'call', name: 'test', arguments: {} },
  definition: {
    name: 'test',
    description: 'test',
    inputSchema: { type: 'object' },
    risk,
    origin: { kind: 'BuiltIn' },
  },
  workspaceId: '/workspace',
  paths: [],
  command: command ? classifier.assess(command) : null,
  preview: null,
  preparationKey: 'snapshot',
});
const request = (mode: AgentMode, risk: RiskLevel, command: string | null = null) => ({
  mode,
  risk,
  prepared: prepared(risk, command),
  commandAllowlist: ['git status', 'npm test'],
});

describe('permission policy and command parsing', () => {
  it.each([
    'git status && rm -rf .',
    'git status || echo yes',
    'git status; echo yes',
    'git status | cat',
    'git status > output',
    'git status < input',
    'git status $(echo x)',
    'git status `echo x`',
    'git status\necho yes',
  ])('never allowlists compound syntax %s', (command) => {
    const assessment = classifier.assess(command);
    expect(assessment.allowlistKey).toBeNull();
    expect(classifier.matches(assessment, [command])).toBe(false);
  });
  it('matches the full parsed executable and argv without prefix matching', () => {
    expect(classifier.matches(classifier.assess('git  "status"'), ['git status'])).toBe(true);
    expect(classifier.matches(classifier.assess('git status --short'), ['git status'])).toBe(false);
    expect(classifier.matches(classifier.assess('/tmp/git status'), ['git status'])).toBe(false);
  });
  it.each([
    'rm -rf .',
    'find . -delete',
    'git clean -fd',
    'git reset --hard',
    'Remove-Item -Recurse .',
    'del /s .',
  ])('blocks destructive command %s even if allowlisted', (command) => {
    expect(classifier.assess(command).risk).toBe('Destructive');
    expect(
      new PermissionPolicy().evaluate({
        ...request('Auto', 'Destructive', command),
        commandAllowlist: [command],
      }).action,
    ).toBe('Block');
  });
  it.each([
    ['Plan', 'ReadOnly', 'Allow'],
    ['Plan', 'WorkspaceWrite', 'Block'],
    ['Plan', 'ProcessExecution', 'Block'],
    ['Manual', 'ReadOnly', 'Allow'],
    ['Manual', 'WorkspaceWrite', 'RequireApproval'],
    ['Manual', 'ProcessExecution', 'RequireApproval'],
    ['Edit', 'WorkspaceWrite', 'Allow'],
    ['Edit', 'ProcessExecution', 'RequireApproval'],
    ['Auto', 'WorkspaceWrite', 'Allow'],
  ] as const)('%s handles %s as %s', (mode, risk, action) =>
    expect(new PermissionPolicy().evaluate(request(mode, risk)).action).toBe(action),
  );
  it('Auto requires approval for nonallowlisted commands and conservative MCP risks', () => {
    expect(
      new PermissionPolicy().evaluate(request('Auto', 'ProcessExecution', 'git status')).action,
    ).toBe('Allow');
    expect(
      new PermissionPolicy().evaluate(request('Auto', 'ProcessExecution', 'git push')).action,
    ).toBe('RequireApproval');
    expect(new PermissionPolicy().evaluate(request('Auto', 'ProcessExecution')).action).toBe(
      'RequireApproval',
    );
  });
  it('retains the strictest guardrail decision and fails closed if a guardrail throws', async () => {
    const evaluator = new GuardrailEvaluator([
      { id: 'block', evaluate: async () => ({ action: 'Block', reasons: ['unsafe'] }) },
      { id: 'allow', evaluate: async () => ({ action: 'Allow', reasons: [] }) },
    ]);
    expect(
      await evaluator.evaluate(
        request('Auto', 'ReadOnly'),
        { action: 'Allow', reasons: [] },
        new CancellationSource(),
      ),
    ).toEqual({ action: 'Block', reasons: ['unsafe'] });
    const failure = new GuardrailEvaluator([
      {
        id: 'broken',
        evaluate: async () => {
          throw new Error('broken');
        },
      },
    ]);
    expect(
      (
        await failure.evaluate(
          request('Auto', 'ReadOnly'),
          { action: 'Allow', reasons: [] },
          new CancellationSource(),
        )
      ).action,
    ).toBe('Block');
  });
});

describe('checked execution pipeline', () => {
  const tool = (snapshot: PreparedToolCall): Tool => ({
    definition: snapshot.definition,
    prepare: async () => ({ status: 'Ready', prepared: snapshot }),
    execute: vi.fn(async () => ({
      callId: 'call',
      toolName: 'test',
      status: 'Success' as const,
      output: 'done',
      error: null,
      omittedCharacters: 0,
      durationMs: 0,
    })),
  });
  it('routes protected path RequireApproval through ApprovalPort even in Auto', async () => {
    const snapshot = {
      ...prepared('WorkspaceWrite'),
      paths: [
        {
          access: 'Write' as const,
          path: {
            workspaceId: '/workspace',
            relativePath: '.kova/mcp.json',
            canonicalPath: '/workspace/.kova/mcp.json',
            exists: true,
            protected: true,
          },
        },
      ],
    };
    const registry = new ToolRegistry(),
      implementation = tool(snapshot);
    registry.register(implementation);
    const approval = {
      request: vi.fn(
        async (
          req: Parameters<
            import('../../packages/core/src/permissions/ApprovalPort.js').ApprovalPort['request']
          >[0],
        ) => ({
          approvalId: req.approvalId,
          preparationKey: req.preparationKey,
          decision: 'AllowOnce' as const,
        }),
      ),
    };
    const log = new EventLog();
    const runtime = new DefaultToolRuntime(
      '/workspace',
      registry,
      approval,
      new HookPipeline(),
      new GuardrailEvaluator([new ProtectedPathGuardrail()]),
    );
    expect(
      (await runtime.execute(snapshot.call, 'Auto', [], new CancellationSource(), log, 'real-run'))
        .status,
    ).toBe('Success');
    expect(approval.request).toHaveBeenCalledOnce();
    expect(approval.request.mock.calls[0]?.[0].runId).toBe('real-run');
    expect(implementation.execute).toHaveBeenCalledOnce();
    expect(log.events.findIndex((event) => event.type === 'ToolAwaitingApproval')).toBeLessThan(
      log.events.findIndex((event) => event.type === 'ToolStarted'),
    );
  });
  it('rejects a mismatched preview approval before executing', async () => {
    const snapshot = prepared('WorkspaceWrite'),
      registry = new ToolRegistry(),
      implementation = tool(snapshot);
    registry.register(implementation);
    const runtime = new DefaultToolRuntime(
      '/workspace',
      registry,
      {
        request: async (req) => ({
          approvalId: req.approvalId,
          preparationKey: 'wrong',
          decision: 'AllowOnce',
        }),
      },
      new HookPipeline(),
      new GuardrailEvaluator([]),
    );
    expect(
      (
        await runtime.execute(
          snapshot.call,
          'Manual',
          [],
          new CancellationSource(),
          new EventLog(),
          'run',
        )
      ).status,
    ).toBe('Denied');
    expect(implementation.execute).not.toHaveBeenCalled();
  });
  it('pre-hook crash vetoes before execution and guardrails still run last', async () => {
    const snapshot = prepared('ReadOnly'),
      registry = new ToolRegistry(),
      implementation = tool(snapshot);
    registry.register(implementation);
    const hook: Hook = {
      id: 'crash',
      run: async () => {
        throw new Error('crash');
      },
    };
    const guard = vi.fn(async () => ({ action: 'Allow' as const, reasons: [] }));
    const runtime = new DefaultToolRuntime(
      '/workspace',
      registry,
      {
        request: async () => {
          throw new Error('no approval');
        },
      },
      new HookPipeline([hook]),
      new GuardrailEvaluator([{ id: 'last', evaluate: guard }]),
    );
    const log = new EventLog();
    expect(
      (await runtime.execute(snapshot.call, 'Auto', [], new CancellationSource(), log, 'run'))
        .status,
    ).toBe('Blocked');
    expect(implementation.execute).not.toHaveBeenCalled();
    expect(guard).toHaveBeenCalledOnce();
    expect(log.events.findIndex((event) => event.type === 'HookObserved')).toBeLessThan(
      log.events.findIndex((event) => event.type === 'GuardrailEvaluated'),
    );
  });
  it('post-hook crash is visible but preserves the completed result', async () => {
    const snapshot = prepared('ReadOnly'),
      registry = new ToolRegistry(),
      implementation = tool(snapshot);
    registry.register(implementation);
    const runtime = new DefaultToolRuntime(
      '/workspace',
      registry,
      {
        request: async () => {
          throw new Error('no approval');
        },
      },
      new HookPipeline(
        [],
        [
          {
            id: 'post',
            run: async () => {
              throw new Error('crash');
            },
          },
        ],
      ),
      new GuardrailEvaluator([]),
    );
    const log = new EventLog();
    expect(
      (await runtime.execute(snapshot.call, 'Auto', [], new CancellationSource(), log, 'run'))
        .status,
    ).toBe('Success');
    expect(log.events).toContainEqual(
      expect.objectContaining({
        type: 'HookObserved',
        report: expect.objectContaining({ outcome: 'Failed' }),
      }),
    );
  });
  it('post-hook cancellation never replaces the executed Success result', async () => {
    const snapshot = prepared('ReadOnly'),
      registry = new ToolRegistry(),
      implementation = tool(snapshot);
    registry.register(implementation);
    const cancellation = new CancellationSource();
    const post: Hook = {
      id: 'cancel-post',
      run: async () => {
        cancellation.cancel();
        throw new Error('cancelled post-hook');
      },
    };
    const runtime = new DefaultToolRuntime(
      '/workspace',
      registry,
      {
        request: async () => {
          throw new Error('unexpected approval');
        },
      },
      new HookPipeline([], [post]),
      new GuardrailEvaluator([]),
    );
    expect(
      (await runtime.execute(snapshot.call, 'Auto', [], cancellation, new EventLog(), 'run'))
        .status,
    ).toBe('Success');
  });
  it('never runs post-hooks for denied or blocked calls', async () => {
    for (const [risk, mode] of [
      ['Destructive', 'Auto'],
      ['WorkspaceWrite', 'Manual'],
    ] as const) {
      const snapshot = prepared(risk),
        registry = new ToolRegistry(),
        implementation = tool(snapshot);
      registry.register(implementation);
      const post = {
        id: 'post',
        run: vi.fn(async () => {
          throw new Error('must not run');
        }),
      };
      const runtime = new DefaultToolRuntime(
        '/workspace',
        registry,
        {
          request: async (req) => ({
            approvalId: req.approvalId,
            preparationKey: req.preparationKey,
            decision: 'Reject',
          }),
        },
        new HookPipeline([], [post]),
        new GuardrailEvaluator([]),
      );
      const result = await runtime.execute(
        snapshot.call,
        mode,
        [],
        new CancellationSource(),
        new EventLog(),
        'run',
      );
      expect(result.status).toBe(risk === 'Destructive' ? 'Blocked' : 'Denied');
      expect(post.run).not.toHaveBeenCalled();
      expect(implementation.execute).not.toHaveBeenCalled();
    }
  });
  it('rechecks final guardrails after approval and respects a new Block', async () => {
    const snapshot = prepared('WorkspaceWrite'),
      registry = new ToolRegistry(),
      implementation = tool(snapshot);
    registry.register(implementation);
    let blocked = false;
    const guard = {
      id: 'dynamic',
      evaluate: vi.fn(async () => ({
        action: blocked ? ('Block' as const) : ('Allow' as const),
        reasons: blocked ? ['Changed while waiting'] : [],
      })),
    };
    const runtime = new DefaultToolRuntime(
      '/workspace',
      registry,
      {
        request: async (req) => {
          blocked = true;
          return {
            approvalId: req.approvalId,
            preparationKey: req.preparationKey,
            decision: 'AllowOnce',
          };
        },
      },
      new HookPipeline(),
      new GuardrailEvaluator([guard]),
    );
    expect(
      (
        await runtime.execute(
          snapshot.call,
          'Manual',
          [],
          new CancellationSource(),
          new EventLog(),
          'run',
        )
      ).status,
    ).toBe('Blocked');
    expect(guard.evaluate).toHaveBeenCalledTimes(2);
    expect(implementation.execute).not.toHaveBeenCalled();
  });
  it('registry exposes only reads in Plan and refuses duplicate names', () => {
    const registry = new ToolRegistry();
    registry.register(tool(prepared('ProcessExecution')));
    expect(registry.definitions('Plan')).toEqual([]);
    expect(() => registry.register(tool(prepared('ReadOnly')))).toThrow('Duplicate');
  });
});
