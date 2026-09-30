import type { AgentMode } from '../agents/AgentMode.js';
import type { AgentEventSink } from '../agents/AgentEventSink.js';
import type { CancellationToken } from '../common/CancellationToken.js';
import { HookPipeline } from '../hooks/HookPipeline.js';
import type { ApprovalPort } from '../permissions/ApprovalPort.js';
import { GuardrailEvaluator } from '../permissions/GuardrailEvaluator.js';
import { PermissionPolicy } from '../permissions/PermissionPolicy.js';
import { ToolInputValidator } from './ToolInputValidator.js';
import { ToolRegistry } from './ToolRegistry.js';
import type { ToolRuntime } from './ToolRuntime.js';
import type { ToolCall } from './ToolCall.js';
import type { ToolDefinition } from './ToolDefinition.js';
import type { ToolResult } from './ToolResult.js';

export class DefaultToolRuntime implements ToolRuntime {
  constructor(
    private readonly workspaceId: string,
    private readonly registry: ToolRegistry,
    private readonly approval: ApprovalPort,
    private readonly hooks: HookPipeline,
    private readonly guardrails: GuardrailEvaluator,
  ) {}
  definitions(mode: AgentMode): readonly ToolDefinition[] {
    return this.registry.definitions(mode);
  }
  async execute(
    call: ToolCall,
    mode: AgentMode,
    commandAllowlist: readonly string[],
    cancellation: CancellationToken,
    events: AgentEventSink,
    runId: string,
  ): Promise<ToolResult> {
    const error = (status: ToolResult['status'], code: string, message: string): ToolResult => ({
      callId: call.id,
      toolName: call.name,
      status,
      output: '',
      error: { code, message, details: {} },
      omittedCharacters: 0,
      durationMs: 0,
    });
    let result: ToolResult;
    let executed = false;
    try {
      cancellation.throwIfCancellationRequested();
      const tool = this.registry.get(call.name);
      if (!tool) return error('Error', 'UnknownTool', `Unknown tool: ${call.name}`);
      const validation = new ToolInputValidator().validate(call, tool.definition);
      if (!validation.valid) return error('Error', validation.code, validation.message);
      events.emit({
        type: 'ToolRequested',
        call,
        sourceLabel:
          tool.definition.origin.kind === 'Mcp'
            ? `MCP ${tool.definition.origin.serverId}`
            : 'Built-in',
      });
      events.emit({ type: 'StateChanged', state: 'PreparingTool' });
      const preparation = await tool.prepare(call, this.workspaceId, cancellation);
      if (preparation.status === 'Error') {
        events.emit({ type: 'ToolCompleted', callId: call.id, result: preparation.result });
        return preparation.result;
      }
      const prepared = preparation.prepared;
      const risk = prepared.command?.risk ?? tool.definition.risk;
      const request = { mode, risk, prepared, commandAllowlist };
      events.emit({ type: 'StateChanged', state: 'EvaluatingPolicy' });
      const policy = new PermissionPolicy().evaluate(request);
      events.emit({ type: 'PolicyEvaluated', callId: call.id, risk, decision: policy });
      events.emit({ type: 'StateChanged', state: 'RunningPreHooks' });
      const reports = await this.hooks.run(
        { event: 'BeforeToolExecution', prepared },
        cancellation,
        events,
      );
      const hookReasons = reports
        .filter((report) => report.outcome !== 'Observed')
        .map((report) => `${report.hookId}: ${report.message}`);
      events.emit({ type: 'StateChanged', state: 'EvaluatingGuardrails' });
      const decision = await this.guardrails.evaluate(
        request,
        hookReasons.length
          ? { action: 'Block', reasons: [...policy.reasons, ...hookReasons] }
          : policy,
        cancellation,
      );
      events.emit({ type: 'GuardrailEvaluated', callId: call.id, decision });
      if (decision.action === 'Block') {
        events.emit({ type: 'ToolBlocked', callId: call.id, reasons: decision.reasons });
        result = error('Blocked', 'PolicyBlocked', decision.reasons.join('; '));
      } else {
        if (decision.action === 'RequireApproval') {
          const approvalRequest = {
            approvalId: `${call.id}:${prepared.preparationKey}`,
            runId,
            call: prepared.call,
            risk,
            reasons: decision.reasons,
            preview: prepared.preview,
            preparationKey: prepared.preparationKey,
          };
          events.emit({ type: 'StateChanged', state: 'AwaitingApproval' });
          events.emit({ type: 'ToolAwaitingApproval', request: approvalRequest });
          const response = await this.approval.request(approvalRequest, cancellation);
          if (
            response.decision !== 'AllowOnce' ||
            response.approvalId !== approvalRequest.approvalId ||
            response.preparationKey !== prepared.preparationKey
          ) {
            events.emit({ type: 'ToolDenied', callId: call.id });
            result = error('Denied', 'ApprovalRejected', 'Tool approval was rejected');
            events.emit({ type: 'ToolCompleted', callId: call.id, result });
            return result;
          }
          events.emit({ type: 'StateChanged', state: 'EvaluatingGuardrails' });
          const finalDecision = await this.guardrails.evaluate(request, decision, cancellation);
          events.emit({ type: 'GuardrailEvaluated', callId: call.id, decision: finalDecision });
          if (finalDecision.action === 'Block') {
            events.emit({ type: 'ToolBlocked', callId: call.id, reasons: finalDecision.reasons });
            result = error('Blocked', 'PolicyBlocked', finalDecision.reasons.join('; '));
            events.emit({ type: 'ToolCompleted', callId: call.id, result });
            return result;
          }
        }
        cancellation.throwIfCancellationRequested();
        executed = true;
        events.emit({ type: 'StateChanged', state: 'ExecutingTool' });
        events.emit({ type: 'ToolStarted', callId: call.id });
        try {
          result = await tool.execute(prepared, cancellation);
        } catch (failure) {
          result = error(
            cancellation.isCancellationRequested ? 'Cancelled' : 'Error',
            cancellation.isCancellationRequested ? 'Cancelled' : 'ToolExecutionFailed',
            failure instanceof Error ? failure.message : 'Tool failed',
          );
        }
      }
      if (executed && !cancellation.isCancellationRequested) {
        events.emit({ type: 'StateChanged', state: 'RunningPostHooks' });
        try {
          await this.hooks.run(
            { event: 'AfterToolExecution', prepared, result },
            cancellation,
            events,
          );
        } catch {
          events.emit({
            type: 'ErrorOccurred',
            code: 'AfterHookFailed',
            message: 'Post-hook failed after execution; tool result was preserved',
            recoverable: true,
          });
        }
      }
    } catch (failure) {
      result = error(
        cancellation.isCancellationRequested ? 'Cancelled' : 'Error',
        cancellation.isCancellationRequested ? 'Cancelled' : 'ToolPipelineFailed',
        failure instanceof Error ? failure.message : 'Tool pipeline failed',
      );
    }
    events.emit({ type: 'ToolCompleted', callId: call.id, result });
    return result;
  }
}
