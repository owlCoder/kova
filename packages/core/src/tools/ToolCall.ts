import type { JsonObject } from '../common/JsonValue.js';

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: JsonObject;
}
