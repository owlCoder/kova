import type { AgentMode } from '../agents/AgentMode.js';
import type { Tool } from './Tool.js';
import type { ToolDefinition } from './ToolDefinition.js';

export interface ToolRegistry {
  /** Duplicate names are rejected, never silently overwritten. */
  register(tool: Tool): void;
  unregister(name: string): void;
  get(name: string): Tool | null;
  definitions(mode: AgentMode): readonly ToolDefinition[];
}
