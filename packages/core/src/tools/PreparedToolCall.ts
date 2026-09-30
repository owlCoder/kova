import type { CommandAssessment } from '../permissions/CommandAssessment.js';
import type { WorkspacePath } from '../workspace/WorkspacePath.js';
import type { ToolCall } from './ToolCall.js';
import type { ToolDefinition } from './ToolDefinition.js';
import type { ToolPreview } from './ToolPreview.js';

export interface PreparedToolCall {
  readonly call: ToolCall;
  readonly definition: ToolDefinition;
  readonly workspaceId: string;
  readonly paths: readonly { readonly access: 'Read' | 'Write'; readonly path: WorkspacePath }[];
  readonly command: CommandAssessment | null;
  readonly preview: ToolPreview | null;
  /** Identifies immutable normalized arguments + preview + expected file versions. */
  readonly preparationKey: string;
}
