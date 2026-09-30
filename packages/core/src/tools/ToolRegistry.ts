import type { AgentMode } from '../agents/AgentMode.js';
import type { Tool } from './Tool.js';
import type { ToolDefinition } from './ToolDefinition.js';

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  register(tool: Tool): void {
    if (this.tools.has(tool.definition.name))
      throw new Error(`Duplicate tool: ${tool.definition.name}`);
    this.tools.set(tool.definition.name, tool);
  }
  unregister(name: string): void {
    this.tools.delete(name);
  }
  get(name: string): Tool | null {
    return this.tools.get(name) ?? null;
  }
  definitions(mode: AgentMode): readonly ToolDefinition[] {
    return [...this.tools.values()]
      .map((tool) => tool.definition)
      .filter((tool) => mode !== 'Plan' || tool.risk === 'ReadOnly');
  }
}
