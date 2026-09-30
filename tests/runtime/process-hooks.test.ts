import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NodeProcessRunner } from '../../packages/vscode/src/adapters/NodeProcessRunner.js';
import { CommandHook } from '../../packages/vscode/src/adapters/CommandHook.js';
import { NodeWorkspacePathGuard } from '../../packages/vscode/src/adapters/NodeWorkspacePathGuard.js';
import { RunCommandTool } from '../../packages/vscode/src/tools/RunCommandTool.js';
import type { ProcessRunner } from '../../packages/core/src/processes/ProcessRunner.js';
import type { PreparedToolCall } from '../../packages/core/src/tools/PreparedToolCall.js';
import { CancellationSource } from './helpers.js';
let root: string, runner: NodeProcessRunner;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kova-process-'));
  runner = new NodeProcessRunner(root);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const snapshot: PreparedToolCall = {
  call: { id: 'call', name: 'read_file', arguments: { path: 'a.txt' } },
  definition: {
    name: 'read_file',
    description: 'read',
    inputSchema: {},
    risk: 'ReadOnly',
    origin: { kind: 'BuiltIn' },
  },
  workspaceId: 'root',
  paths: [],
  command: null,
  preview: null,
  preparationKey: 'key',
};
const hook = (script: string, timeoutMs = 1000) =>
  new CommandHook(
    { id: 'hook', command: process.execPath, args: ['-e', script], timeoutMs },
    runner,
    root,
  );

describe('bounded cancellable process runner', () => {
  it('bounds combined output and counts omissions', async () => {
    const result = await runner.run(
      {
        workspaceId: root,
        command: process.execPath,
        args: [
          '-e',
          "process.stdout.write('a'.repeat(20000));process.stderr.write('b'.repeat(20000));",
        ],
        timeoutMs: 1000,
        maxOutputCharacters: 1000,
      },
      new CancellationSource(),
    );
    expect(result.stdout.length + result.stderr.length).toBe(1000);
    expect(result.omittedCharacters).toBe(39000);
    expect(result.exitCode).toBe(0);
  });
  it('times out a stalled process and reports timeout', async () => {
    const result = await runner.run(
      {
        workspaceId: root,
        command: process.execPath,
        args: ['-e', 'setInterval(()=>{},1000)'],
        timeoutMs: 80,
        maxOutputCharacters: 100,
      },
      new CancellationSource(),
    );
    expect(result.timedOut).toBe(true);
    expect(result.cancelled).toBe(false);
  });
  it('cancels in-flight processes promptly', async () => {
    const cancellation = new CancellationSource();
    const promise = runner.run(
      {
        workspaceId: root,
        command: process.execPath,
        args: ['-e', 'setInterval(()=>{},1000)'],
        timeoutMs: 30000,
        maxOutputCharacters: 100,
      },
      cancellation,
    );
    setTimeout(() => cancellation.cancel(), 80);
    expect((await promise).cancelled).toBe(true);
  });
  it('passes stdin to a directly invoked command without a shell', async () => {
    const result = await runner.run(
      {
        workspaceId: root,
        command: process.execPath,
        args: ['-e', "process.stdout.write(require('fs').readFileSync(0,'utf8'))"],
        stdin: 'data',
        timeoutMs: 1000,
        maxOutputCharacters: 100,
      },
      new CancellationSource(),
    );
    expect(result.stdout).toBe('data');
  });
  it('run_command prepares risk and handles a nonzero exit as a structured error', async () => {
    const tool = new RunCommandTool(new NodeWorkspacePathGuard(root), runner);
    const prepared = await tool.prepare(
      { id: 'c', name: 'run_command', arguments: { command: 'exit 4' } },
      root,
      new CancellationSource(),
    );
    if (prepared.status !== 'Ready') throw new Error('bad prep');
    expect(prepared.prepared.command?.risk).toBe('ProcessExecution');
    expect((await tool.execute(prepared.prepared, new CancellationSource())).error?.code).toBe(
      'CommandFailed',
    );
  });
});

describe('command hooks', () => {
  it('observes or vetoes valid JSON output', async () => {
    expect(
      (
        await hook("console.log(JSON.stringify({decision:'continue'}))").run(
          { event: 'BeforeToolExecution', prepared: snapshot },
          new CancellationSource(),
        )
      ).outcome,
    ).toBe('Observed');
    expect(
      (
        await hook("console.log(JSON.stringify({decision:'veto',message:'blocked'}))").run(
          { event: 'BeforeToolExecution', prepared: snapshot },
          new CancellationSource(),
        )
      ).message,
    ).toBe('blocked');
  });
  it.each([
    "console.log('invalid json')",
    "console.log(JSON.stringify({decision:'allow'}))",
    "console.log(JSON.stringify({decision:['continue']}))",
    "console.log(JSON.stringify({decision:'continue',arguments:{content:'replacement'}}))",
    'process.exit(2)',
  ])('fails closed on invalid/crashed command %s', async (script) => {
    expect(
      (
        await hook(script).run(
          { event: 'BeforeToolExecution', prepared: snapshot },
          new CancellationSource(),
        )
      ).outcome,
    ).toBe('Failed');
  });
  it('passes bounded observational metadata without file contents or tool outputs', async () => {
    let captured = '';
    const fake: ProcessRunner = {
      run: async (request) => {
        captured = request.stdin ?? '';
        return {
          exitCode: 0,
          stdout: '{"decision":"continue"}',
          stderr: '',
          omittedCharacters: 0,
          cancelled: false,
          timedOut: false,
        };
      },
    };
    const configured = new CommandHook(
      { id: 'audit', command: 'node', args: [], timeoutMs: 1000 },
      fake,
      root,
    );
    await configured.run(
      {
        event: 'AfterToolExecution',
        prepared: {
          ...snapshot,
          call: {
            ...snapshot.call,
            arguments: {
              content: 'secret-file',
              old_string: 'secret-before',
              new_string: 'secret-after',
              token: 'secret-token',
              query: 'q'.repeat(10000),
            },
          },
        },
        result: {
          callId: 'call',
          toolName: 'read_file',
          status: 'Success',
          output: 'secret-output',
          error: null,
          omittedCharacters: 0,
          durationMs: 0,
        },
      },
      new CancellationSource(),
    );
    expect(captured).not.toContain('secret-');
    expect(captured.length).toBeLessThan(1000);
    expect(JSON.parse(captured)).toMatchObject({
      result: { status: 'Success', errorCode: null },
      risk: 'ReadOnly',
    });
  });
  it('fails visibly on timeout', async () => {
    const report = await hook('setInterval(()=>{},1000)', 70).run(
      { event: 'BeforeToolExecution', prepared: snapshot },
      new CancellationSource(),
    );
    expect(report.outcome).toBe('Failed');
    expect(report.message).toContain('timed out');
  });
});
