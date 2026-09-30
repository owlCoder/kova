import type { JsonValue } from '../common/JsonValue.js';

/** Unvalidated provider data. Strings may contain JSON to parse; never execute directly. */
export interface ToolCallCandidate {
  readonly id: string;
  readonly name: string;
  readonly arguments: JsonValue;
}
