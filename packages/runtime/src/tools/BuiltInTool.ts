import { createHash } from 'node:crypto';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { JsonObject } from '../../../core/src/common/JsonValue.js';
import type { CommandAssessment } from '../../../core/src/permissions/CommandAssessment.js';
import type { PreparedToolCall } from '../../../core/src/tools/PreparedToolCall.js';
import type { Tool } from '../../../core/src/tools/Tool.js';
import type { ToolCall } from '../../../core/src/tools/ToolCall.js';
import type { ToolDefinition } from '../../../core/src/tools/ToolDefinition.js';
import type { ToolPreview } from '../../../core/src/tools/ToolPreview.js';
import type { ToolPreparationResult } from '../../../core/src/tools/ToolPreparationResult.js';
import type { ToolResult } from '../../../core/src/tools/ToolResult.js';

export abstract class BuiltInTool implements Tool {
  abstract readonly definition: ToolDefinition;
  async prepare(
    call: ToolCall,
    workspaceId: string,
    cancellation: CancellationToken,
  ): Promise<ToolPreparationResult> {
    try {
      cancellation.throwIfCancellationRequested();
      return await this.prepareCall(call, workspaceId, cancellation);
    } catch (failure) {
      return { status: 'Error', result: this.failure(call, failure, cancellation) };
    }
  }
  async execute(prepared: PreparedToolCall, cancellation: CancellationToken): Promise<ToolResult> {
    const start = Date.now();
    try {
      cancellation.throwIfCancellationRequested();
      const result = await this.perform(prepared, cancellation);
      const cap = 30000,
        omitted = Math.max(0, result.output.length - cap);
      const marker = omitted
        ? `\n[output truncated: omitted ${omitted} characters; narrow the search or read a line range]`
        : '';
      return {
        ...result,
        output: omitted ? result.output.slice(0, cap - marker.length) + marker : result.output,
        omittedCharacters: result.omittedCharacters + omitted,
        durationMs: Date.now() - start,
      };
    } catch (failure) {
      return {
        ...this.failure(prepared.call, failure, cancellation),
        durationMs: Date.now() - start,
      };
    }
  }
  protected abstract prepareCall(
    call: ToolCall,
    workspaceId: string,
    cancellation: CancellationToken,
  ): Promise<ToolPreparationResult>;
  protected abstract perform(
    prepared: PreparedToolCall,
    cancellation: CancellationToken,
  ): Promise<ToolResult>;
  protected ready(
    call: ToolCall,
    workspaceId: string,
    paths: PreparedToolCall['paths'] = [],
    preview: ToolPreview | null = null,
    command: CommandAssessment | null = null,
  ): ToolPreparationResult {
    const snapshot: ToolCall = JSON.parse(JSON.stringify(call)) as ToolCall;
    const preparationKey = createHash('sha256')
      .update(JSON.stringify({ call: snapshot, paths, preview, command }))
      .digest('hex');
    return {
      status: 'Ready',
      prepared: {
        call: snapshot,
        definition: this.definition,
        workspaceId,
        paths,
        preview,
        command,
        preparationKey,
      },
    };
  }
  protected stringArgument(call: ToolCall, name: string, allowEmpty = false): string {
    const value = call.arguments[name];
    if (typeof value !== 'string' || (!allowEmpty && value.length === 0))
      throw new Error(
        `Invalid argument: ${name} must be ${allowEmpty ? 'a' : 'a nonempty'} string`,
      );
    return value;
  }
  protected integerArgument(
    call: ToolCall,
    name: string,
    fallback: number,
    maximum: number,
  ): number {
    const value = call.arguments[name] ?? fallback;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > maximum)
      throw new Error(`Invalid argument: ${name} must be an integer from 1 to ${maximum}`);
    return value;
  }
  protected success(call: ToolCall, output: string): ToolResult {
    return {
      callId: call.id,
      toolName: call.name,
      status: 'Success',
      output,
      error: null,
      omittedCharacters: 0,
      durationMs: 0,
    };
  }
  protected error(
    call: ToolCall,
    code: string,
    message: string,
    details: JsonObject = {},
  ): ToolResult {
    return {
      callId: call.id,
      toolName: call.name,
      status: 'Error',
      output: '',
      error: { code, message, details },
      omittedCharacters: 0,
      durationMs: 0,
    };
  }
  private failure(call: ToolCall, failure: unknown, cancellation: CancellationToken): ToolResult {
    const result = this.error(
      call,
      cancellation.isCancellationRequested ? 'Cancelled' : 'WorkspaceToolError',
      failure instanceof Error ? failure.message : 'Workspace operation failed',
    );
    return cancellation.isCancellationRequested ? { ...result, status: 'Cancelled' } : result;
  }
}
