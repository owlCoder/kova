import type * as vscode from 'vscode';
import type { AgentEvent } from '../../../core/src/agents/AgentEvent.js';

export function logAgentEvent(output: vscode.OutputChannel, event: AgentEvent): void {
  if (event.type === 'ResponseDelta' || event.type === 'ThinkingDelta') return;
  const detail =
    event.type === 'McpServerStarted'
      ? ` ${event.command} ${event.args.map((arg) => JSON.stringify(arg)).join(' ')}`
      : event.type === 'HookObserved'
        ? ` ${event.report.command} ${event.report.args.map((arg) => JSON.stringify(arg)).join(' ')} ${event.report.outcome} ${event.report.durationMs}ms`
        : event.type === 'ErrorOccurred'
          ? ` ${event.code}`
          : '';
  output.appendLine(`[${event.type}]${detail}`);
}
