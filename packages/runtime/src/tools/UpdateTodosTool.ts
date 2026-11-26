import type { AgentEventSink } from '../../../core/src/agents/AgentEventSink.js';
import type { TodoItem } from '../../../core/src/agents/TodoItem.js';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { JsonValue } from '../../../core/src/common/JsonValue.js';
import type { ToolCall } from '../../../core/src/tools/ToolCall.js';
import type { ToolDefinition } from '../../../core/src/tools/ToolDefinition.js';
import type { PreparedToolCall } from '../../../core/src/tools/PreparedToolCall.js';
import type { ToolPreparationResult } from '../../../core/src/tools/ToolPreparationResult.js';
import type { ToolResult } from '../../../core/src/tools/ToolResult.js';
import { BuiltInTool } from './BuiltInTool.js';

const MAX_TODOS = 20;
const MAX_CONTENT = 200;
const STATUSES = ['pending', 'in_progress', 'completed'] as const;

/**
 * Lets the agent publish its plan as a checklist. ReadOnly risk: it changes no
 * workspace state, only emits TodosUpdated so the transcript can render it.
 */
export class UpdateTodosTool extends BuiltInTool {
  readonly definition: ToolDefinition = {
    name: 'update_todos',
    description:
      'Replace the visible task list for this run. Use it to plan multi-step work and to mark steps pending, in_progress or completed as you go.',
    inputSchema: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          maxItems: MAX_TODOS,
          items: {
            type: 'object',
            properties: {
              content: { type: 'string', minLength: 1, maxLength: MAX_CONTENT },
              status: { type: 'string', enum: [...STATUSES] },
            },
            required: ['content', 'status'],
            additionalProperties: false,
          },
        },
      },
      required: ['todos'],
      additionalProperties: false,
    },
    risk: 'ReadOnly',
    origin: { kind: 'BuiltIn' },
  };
  constructor(private readonly events: AgentEventSink) {
    super();
  }
  protected async prepareCall(
    call: ToolCall,
    workspaceId: string,
    cancellation: CancellationToken,
  ): Promise<ToolPreparationResult> {
    cancellation.throwIfCancellationRequested();
    const raw = call.arguments['todos'];
    if (!Array.isArray(raw)) throw new Error('todos must be an array');
    const todos: TodoItem[] = raw.map((item, index) => {
      const record = item as Record<string, JsonValue>;
      const content = record['content'],
        status = record['status'];
      if (
        typeof content !== 'string' ||
        content.length === 0 ||
        content.length > MAX_CONTENT ||
        typeof status !== 'string' ||
        !(STATUSES as readonly string[]).includes(status)
      )
        throw new Error(`Invalid todo at index ${index}`);
      return { id: `todo-${index + 1}`, content, status: status as TodoItem['status'] };
    });
    if (todos.length > MAX_TODOS) throw new Error(`At most ${MAX_TODOS} todos`);
    return this.ready(call, workspaceId, [], {
      kind: 'Description',
      text: todos.map((todo) => `[${todo.status}] ${todo.content}`).join('\n'),
    });
  }
  protected async perform(
    prepared: PreparedToolCall,
    cancellation: CancellationToken,
  ): Promise<ToolResult> {
    cancellation.throwIfCancellationRequested();
    const raw = prepared.call.arguments['todos'];
    const todos: TodoItem[] = (Array.isArray(raw) ? raw : []).map((item, index) => {
      const record = item as Record<string, JsonValue>;
      return {
        id: `todo-${index + 1}`,
        content: String(record['content'] ?? ''),
        status: (record['status'] ?? 'pending') as TodoItem['status'],
      };
    });
    this.events.emit({ type: 'TodosUpdated', todos });
    return this.success(
      prepared.call,
      `${todos.length} step${todos.length === 1 ? '' : 's'} recorded`,
    );
  }
}
