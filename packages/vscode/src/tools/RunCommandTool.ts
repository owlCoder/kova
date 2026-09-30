import { stat } from 'node:fs/promises';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import { CommandRiskClassifier } from '../../../core/src/permissions/CommandRiskClassifier.js';
import type { ProcessRunner } from '../../../core/src/processes/ProcessRunner.js';
import type { ToolCall } from '../../../core/src/tools/ToolCall.js';
import type { ToolDefinition } from '../../../core/src/tools/ToolDefinition.js';
import type { PreparedToolCall } from '../../../core/src/tools/PreparedToolCall.js';
import type { ToolPreparationResult } from '../../../core/src/tools/ToolPreparationResult.js';
import type { ToolResult } from '../../../core/src/tools/ToolResult.js';
import type { WorkspacePathGuard } from '../../../core/src/workspace/WorkspacePathGuard.js';
import { BuiltInTool } from './BuiltInTool.js';

export class RunCommandTool extends BuiltInTool {
  readonly definition: ToolDefinition = {
    name: 'run_command',
    description:
      'Execute a checked command in a workspace directory with timeout, bounded output and cancellation.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        working_directory: { type: 'string' },
        timeout_ms: { type: 'integer', minimum: 1, maximum: 120000 },
      },
      required: ['command'],
      additionalProperties: false,
    },
    risk: 'ProcessExecution',
    origin: { kind: 'BuiltIn' },
  };
  constructor(
    private readonly guard: WorkspacePathGuard,
    private readonly runner: ProcessRunner,
  ) {
    super();
  }
  protected async prepareCall(
    call: ToolCall,
    workspaceId: string,
    cancellation: CancellationToken,
  ): Promise<ToolPreparationResult> {
    const command = this.stringArgument(call, 'command');
    this.integerArgument(call, 'timeout_ms', 120000, 120000);
    const path = await this.guard.resolve(
      workspaceId,
      call.arguments.working_directory === undefined
        ? '.'
        : this.stringArgument(call, 'working_directory'),
      'Read',
      cancellation,
    );
    if (!(await stat(path.canonicalPath)).isDirectory())
      throw new Error('working_directory must be a directory');
    return this.ready(
      call,
      workspaceId,
      [{ access: 'Read', path }],
      { kind: 'Command', command, relativeWorkingDirectory: path.relativePath },
      new CommandRiskClassifier().assess(command),
    );
  }
  protected async perform(
    prepared: PreparedToolCall,
    cancellation: CancellationToken,
  ): Promise<ToolResult> {
    const path = prepared.paths[0]?.path;
    if (!path) throw new Error('Missing command directory');
    const current = await this.guard.resolve(
      prepared.workspaceId,
      path.relativePath,
      'Read',
      cancellation,
    );
    if (current.canonicalPath !== path.canonicalPath)
      return this.error(prepared.call, 'StalePath', 'Working directory changed since preparation');
    const result = await this.runner.run(
      {
        workspaceId: prepared.workspaceId,
        command: this.stringArgument(prepared.call, 'command'),
        workingDirectory: current.canonicalPath,
        timeoutMs: this.integerArgument(prepared.call, 'timeout_ms', 120000, 120000),
        maxOutputCharacters: 30000,
      },
      cancellation,
    );
    const output = `${result.stdout}${result.stderr ? `\n${result.stderr}` : ''}${result.omittedCharacters ? `\n[output truncated: omitted ${result.omittedCharacters} characters]` : ''}`;
    const error = result.timedOut
      ? { code: 'CommandTimeout', message: 'Command timed out', details: {} }
      : result.cancelled
        ? { code: 'Cancelled', message: 'Command cancelled', details: {} }
        : result.exitCode !== 0
          ? {
              code: 'CommandFailed',
              message: `Command exited with code ${result.exitCode}`,
              details: { exitCode: result.exitCode },
            }
          : null;
    return {
      callId: prepared.call.id,
      toolName: prepared.call.name,
      status: result.cancelled ? 'Cancelled' : error ? 'Error' : 'Success',
      output,
      error,
      omittedCharacters: result.omittedCharacters,
      durationMs: 0,
    };
  }
}
