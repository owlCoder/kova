import type { Hook } from '../../../core/src/hooks/Hook.js';
import type { HookCommand } from '../../../core/src/hooks/HookConfiguration.js';
import type { HookContext } from '../../../core/src/hooks/HookContext.js';
import type { HookReport } from '../../../core/src/hooks/HookReport.js';
import type { ProcessRunner } from '../../../core/src/processes/ProcessRunner.js';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';

/** Trusted user configuration runs directly via ProcessRunner outside run_command policy. */
export class CommandHook implements Hook {
  readonly id: string;
  constructor(
    private readonly command: HookCommand,
    private readonly runner: ProcessRunner,
    private readonly root: string,
  ) {
    this.id = command.id;
  }
  private input(context: HookContext): string {
    const argumentsValue: Record<string, string | number | boolean | null> = {};
    for (const key of [
      'start_line',
      'end_line',
      'max_results',
      'staged',
      'timeout_ms',
      'query',
      'glob',
      'command',
    ]) {
      const value = context.prepared.call.arguments[key];
      if (typeof value === 'string') argumentsValue[key] = value.slice(0, 256);
      else if (typeof value === 'number' || typeof value === 'boolean' || value === null)
        argumentsValue[key] = value;
    }
    return JSON.stringify({
      event: context.event,
      tool: {
        id: context.prepared.call.id,
        name: context.prepared.call.name,
        arguments: argumentsValue,
      },
      paths: context.prepared.paths
        .slice(0, 8)
        .map((entry) => ({ access: entry.access, path: entry.path.relativePath.slice(0, 256) })),
      risk: context.prepared.command?.risk ?? context.prepared.definition.risk,
      ...(context.event === 'AfterToolExecution'
        ? {
            result: {
              status: context.result.status,
              errorCode: context.result.error?.code ?? null,
            },
          }
        : {}),
    });
  }
  async run(context: HookContext, cancellation: CancellationToken): Promise<HookReport> {
    const start = Date.now();
    const report = (outcome: HookReport['outcome'], message: string): HookReport => ({
      hookId: this.id,
      event: context.event,
      outcome,
      message,
      command: this.command.command,
      args: this.command.args,
      durationMs: Date.now() - start,
    });
    try {
      const result = await this.runner.run(
        {
          workspaceId: this.root,
          command: this.command.command,
          args: this.command.args,
          stdin: this.input(context),
          timeoutMs: this.command.timeoutMs,
          maxOutputCharacters: 8000,
        },
        cancellation,
      );
      if (result.cancelled || result.timedOut || result.exitCode !== 0)
        return report(
          'Failed',
          result.timedOut
            ? 'Hook timed out'
            : result.cancelled
              ? 'Hook cancelled'
              : 'Hook exited unsuccessfully',
        );
      const output: unknown = JSON.parse(result.stdout);
      if (
        !output ||
        typeof output !== 'object' ||
        !('decision' in output) ||
        typeof output.decision !== 'string' ||
        !['continue', 'veto'].includes(output.decision) ||
        Object.keys(output).some((key) => key !== 'decision' && key !== 'message') ||
        ('message' in output && typeof output.message !== 'string') ||
        result.omittedCharacters > 0
      )
        return report(
          'Failed',
          'Hook returned invalid output; expected {decision:"continue"|"veto",message?:string}',
        );
      return report(
        output.decision === 'veto' ? 'Vetoed' : 'Observed',
        'message' in output
          ? String(output.message)
          : output.decision === 'veto'
            ? 'Hook vetoed execution'
            : 'Hook completed',
      );
    } catch {
      return report('Failed', 'Hook crashed or returned invalid JSON');
    }
  }
}
