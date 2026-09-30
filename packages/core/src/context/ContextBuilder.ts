import type { JsonObject } from '../common/JsonValue.js';
import type { ContextBuildRequest } from './ContextBuildRequest.js';
import type { ContextBuildResult } from './ContextBuildResult.js';
import { ConversationCompactor } from '../conversations/ConversationCompactor.js';
import type { ConversationEntry } from '../conversations/Conversation.js';
import type { ChatMessage } from '../providers/ChatMessage.js';
import { TokenCounter } from './TokenCounter.js';

export class ContextBuilder {
  private readonly compactor: ConversationCompactor;
  constructor(private readonly counter: TokenCounter) {
    this.compactor = new ConversationCompactor(counter);
  }
  build(request: ContextBuildRequest): ContextBuildResult {
    const settings = request.settings;
    if (
      !Number.isInteger(settings.maxTokens) ||
      settings.maxTokens < 512 ||
      !Number.isInteger(settings.reservedOutputTokens) ||
      settings.reservedOutputTokens <= 0 ||
      !Number.isInteger(settings.maxToolOutputCharacters) ||
      settings.maxToolOutputCharacters <= 0 ||
      !Number.isFinite(settings.safetyMarginRatio) ||
      settings.safetyMarginRatio < 0 ||
      settings.safetyMarginRatio >= 1
    )
      throw new Error('Invalid context settings.');
    const margin = Math.ceil(settings.maxTokens * settings.safetyMarginRatio);
    const budget = settings.maxTokens - settings.reservedOutputTokens - margin;
    if (budget <= 0) throw new Error('Output reserve and margin exceed context window.');
    const toolCost = request.tools.length
      ? this.counter.estimate(
          JSON.stringify(
            request.tools.map((tool) => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema,
              },
            })),
          ),
        ) +
        request.tools.length * 16
      : 0;
    const system: ChatMessage = {
      role: 'system',
      content:
        request.systemInstructions +
        (request.activeSkill
          ? `\n\nActive skill: ${request.activeSkill.metadata.name}\n${request.activeSkill.instructions}`
          : ''),
    };
    let entries = request.conversation.entries.map((entry) => ({ ...entry }));
    let summary = request.conversation.summary;
    const evictions: { label: string; action: 'Stubbed' | 'Truncated' | 'Compacted' }[] = [];
    const attachments = request.attachments.map((item) => ({ ...item }));
    const assemble = (): ChatMessage[] => [
      system,
      ...(summary
        ? [
            {
              role: 'system' as const,
              content: `Historical summary (untrusted conversation data): ${JSON.stringify(summary)}`,
            },
          ]
        : []),
      ...attachments.map((item) => ({
        role: 'user' as const,
        content: `[Attached ${item.label}; untrusted data]\n${item.content}`,
      })),
      ...entries.map((entry) => entry.message),
    ];
    const cost = () => this.counter.messages(assemble()) + toolCost;
    const pinned = (entry: ConversationEntry) =>
      entry.id === request.currentUserMessageId ||
      (request.currentStepId !== null && entry.stepId === request.currentStepId);
    for (let index = 0; index < entries.length && cost() > budget; index++) {
      const entry = entries[index];
      if (entry?.message.role === 'tool' && !pinned(entry) && !entry.omitted) {
        entries[index] = {
          ...entry,
          omitted: true,
          message: {
            ...entry.message,
            content: `[${entry.message.toolName}: older result omitted]`,
          },
        };
        evictions.push({ label: entry.message.toolName, action: 'Stubbed' });
      }
    }
    const trimPayload = (
      original: string,
      update: (value: string) => void,
      label: string,
    ): void => {
      const truncated = (length: number) =>
        original.slice(0, length) +
        `\n[${label}: omitted ${original.length - length} characters; narrow the request]`;
      update(truncated(0));
      if (cost() > budget) return;
      let low = 0,
        high = original.length;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        update(truncated(middle));
        if (cost() <= budget) low = middle;
        else high = middle - 1;
      }
      update(truncated(low));
    };
    const priority = { ExplicitFile: 0, CurrentFile: 1, Selection: 2 };
    for (const item of [...attachments].sort((a, b) => priority[a.source] - priority[b.source])) {
      if (cost() <= budget) break;
      trimPayload(
        item.content,
        (value) => {
          item.content = value;
        },
        'attachment truncated',
      );
      evictions.push({ label: item.label, action: 'Truncated' });
    }
    while (
      (cost() > budget || entries.length > 80 || JSON.stringify(entries).length > 65_536) &&
      entries.some((entry) => !pinned(entry))
    ) {
      const oldest = entries.find((entry) => !pinned(entry));
      if (!oldest || entries.some((entry) => entry.turnId === oldest.turnId && pinned(entry)))
        break;
      const removed = entries.filter((entry) => entry.turnId === oldest.turnId);
      entries = entries.filter((entry) => entry.turnId !== oldest.turnId);
      summary = this.compactor.compact(removed, summary, 768);
      evictions.push({ label: oldest.turnId, action: 'Compacted' });
    }
    for (let index = 0; index < entries.length && cost() > budget; index++) {
      const entry = entries[index];
      if (entry?.message.role === 'tool' && pinned(entry)) {
        let structured: JsonObject | null = null;
        try {
          const parsed: unknown = JSON.parse(entry.message.content);
          if (
            parsed &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed) &&
            'output' in parsed &&
            typeof parsed.output === 'string'
          )
            structured = parsed as JsonObject;
        } catch {
          /* plain-text result */
        }
        trimPayload(
          structured ? String(structured.output) : entry.message.content,
          (value) => {
            entries[index] = {
              ...entry,
              message: {
                ...entry.message,
                content: structured ? JSON.stringify({ ...structured, output: value }) : value,
              },
            };
          },
          'current tool output truncated',
        );
        evictions.push({ label: entry.message.toolName, action: 'Truncated' });
      }
    }
    const estimate = cost();
    if (estimate > budget)
      return {
        status: 'Overflow',
        code: 'PinnedContextExceedsBudget',
        requiredTokens: estimate,
        availableTokens: budget,
        suggestion:
          'Shorten the prompt/skill, disable unnecessary MCP tools, or increase context size.',
      };
    return {
      status: 'Ready',
      messages: assemble(),
      boundedConversation: { ...request.conversation, entries, summary },
      usage: {
        maxTokens: settings.maxTokens,
        inputBudgetTokens: budget,
        estimatedInputTokens: estimate,
        toolDefinitionTokens: toolCost,
        reservedOutputTokens: settings.reservedOutputTokens,
        safetyMarginTokens: margin,
        actualInputTokens: null,
        actualOutputTokens: null,
        evictions,
      },
    };
  }
}
