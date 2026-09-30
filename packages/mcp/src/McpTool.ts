import { createHash } from 'node:crypto';
import type { Client, Tool as McpToolDefinition } from '@modelcontextprotocol/client';
import type { AgentEventSink } from '../../core/src/agents/AgentEventSink.js';
import type { CancellationToken } from '../../core/src/common/CancellationToken.js';
import type { Tool } from '../../core/src/tools/Tool.js';
import type { ToolCall } from '../../core/src/tools/ToolCall.js';
import type { ToolDefinition } from '../../core/src/tools/ToolDefinition.js';
import type { PreparedToolCall } from '../../core/src/tools/PreparedToolCall.js';
import type { ToolPreparationResult } from '../../core/src/tools/ToolPreparationResult.js';
import type { ToolResult } from '../../core/src/tools/ToolResult.js';

export class McpTool implements Tool {
  constructor(
    readonly definition: ToolDefinition,
    private readonly client: Client,
    private readonly events: AgentEventSink,
    private readonly remoteDefinition: McpToolDefinition,
  ) {}
  async prepare(
    call: ToolCall,
    workspaceId: string,
    cancellation: CancellationToken,
  ): Promise<ToolPreparationResult> {
    cancellation.throwIfCancellationRequested();
    const snapshot = JSON.parse(JSON.stringify(call)) as ToolCall;
    return {
      status: 'Ready',
      prepared: {
        call: snapshot,
        definition: this.definition,
        workspaceId,
        paths: [],
        command: null,
        preview: {
          kind: 'Description',
          text: `${this.definition.description} (${this.definition.origin.kind === 'Mcp' ? this.definition.origin.serverId : 'MCP'})`,
        },
        preparationKey: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
      },
    };
  }
  async execute(prepared: PreparedToolCall, cancellation: CancellationToken): Promise<ToolResult> {
    const start = Date.now(),
      origin = this.definition.origin;
    if (origin.kind !== 'Mcp') throw new Error('Invalid MCP origin');
    cancellation.throwIfCancellationRequested();
    const abort = new AbortController(),
      subscription = cancellation.onCancellationRequested(() => abort.abort());
    this.events.emit({
      type: 'McpToolCalled',
      serverId: origin.serverId,
      callId: prepared.call.id,
      toolName: origin.remoteName,
    });
    try {
      const result = await this.client.callTool(
        { name: origin.remoteName, arguments: prepared.call.arguments as Record<string, unknown> },
        { signal: abort.signal, timeout: 120000, toolDefinition: this.remoteDefinition },
      );
      if (!Array.isArray(result.content) || result.content.some((item) => item.type !== 'text'))
        return {
          callId: prepared.call.id,
          toolName: prepared.call.name,
          status: 'Error',
          output: '[MCP returned unsupported non-text content]',
          error: {
            code: 'UnsupportedMcpResult',
            message: 'Only text or structured JSON MCP results are supported',
            details: {},
          },
          omittedCharacters: 0,
          durationMs: Date.now() - start,
        };
      const content = result.content
        .filter((item) => item.type === 'text')
        .map((item) => ('text' in item ? String(item.text) : ''))
        .join('\n');
      const text =
        content ||
        (result.structuredContent
          ? JSON.stringify(result.structuredContent)
          : '[MCP returned non-text content]');
      const omittedCharacters = Math.max(0, text.length - 29800),
        output = omittedCharacters
          ? text.slice(0, 29800) + `\n[output truncated: omitted ${omittedCharacters} characters]`
          : text;
      return {
        callId: prepared.call.id,
        toolName: prepared.call.name,
        status: result.isError ? 'Error' : 'Success',
        output,
        error: result.isError
          ? { code: 'McpToolError', message: 'MCP tool returned an error', details: {} }
          : null,
        omittedCharacters,
        durationMs: Date.now() - start,
      };
    } catch (failure) {
      return {
        callId: prepared.call.id,
        toolName: prepared.call.name,
        status: cancellation.isCancellationRequested ? 'Cancelled' : 'Error',
        output: '',
        error: {
          code: cancellation.isCancellationRequested ? 'Cancelled' : 'McpCallFailed',
          message: cancellation.isCancellationRequested
            ? 'MCP call cancelled'
            : failure instanceof Error
              ? failure.message
              : 'MCP call failed',
          details: {},
        },
        omittedCharacters: 0,
        durationMs: Date.now() - start,
      };
    } finally {
      subscription.dispose();
    }
  }
}
