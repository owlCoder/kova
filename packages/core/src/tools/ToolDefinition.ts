import type { JsonObject } from '../common/JsonValue.js';
import type { RiskLevel } from '../permissions/RiskLevel.js';

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
  readonly risk: RiskLevel;
  /** Observability metadata; the orchestration loop must not branch on origin. */
  readonly origin:
    | { readonly kind: 'BuiltIn' }
    | { readonly kind: 'Mcp'; readonly serverId: string; readonly remoteName: string };
}
