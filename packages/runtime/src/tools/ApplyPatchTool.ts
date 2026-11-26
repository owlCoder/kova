import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { ToolCall } from '../../../core/src/tools/ToolCall.js';
import type { ToolDefinition } from '../../../core/src/tools/ToolDefinition.js';
import type { PreparedToolCall } from '../../../core/src/tools/PreparedToolCall.js';
import type { ToolPreparationResult } from '../../../core/src/tools/ToolPreparationResult.js';
import type { ToolResult } from '../../../core/src/tools/ToolResult.js';
import type { WorkspacePath } from '../../../core/src/workspace/WorkspacePath.js';
import type { WorkspacePathGuard } from '../../../core/src/workspace/WorkspacePathGuard.js';
import type { WorkspaceReader } from '../../../core/src/workspace/WorkspaceReader.js';
import type { WorkspaceWriter } from '../../../core/src/workspace/WorkspaceWriter.js';
import { BuiltInTool } from './BuiltInTool.js';
import { applyHunks, parseUnifiedPatch } from './unifiedPatch.js';

/**
 * Applies a unified diff to one or more workspace files. Preparation parses
 * the patch, resolves every path inside the workspace root and computes the
 * full before/after preview; execution writes each file with optimistic
 * version checks.
 */
export class ApplyPatchTool extends BuiltInTool {
  readonly definition: ToolDefinition = {
    name: 'apply_patch',
    description:
      'Apply a unified diff (git-style patch) to one or more workspace files. Paths in ---/+++ headers resolve against the workspace root; hunks must match exactly. Whole-file deletion is not supported.',
    inputSchema: {
      type: 'object',
      properties: { patch: { type: 'string', minLength: 1 } },
      required: ['patch'],
      additionalProperties: false,
    },
    risk: 'WorkspaceWrite',
    origin: { kind: 'BuiltIn' },
  };
  constructor(
    private readonly guard: WorkspacePathGuard,
    private readonly reader: WorkspaceReader,
    private readonly writer: WorkspaceWriter,
  ) {
    super();
  }
  protected async prepareCall(
    call: ToolCall,
    workspaceId: string,
    cancellation: CancellationToken,
  ): Promise<ToolPreparationResult> {
    const patch = this.stringArgument(call, 'patch');
    let files;
    try {
      files = parseUnifiedPatch(patch);
    } catch (error) {
      return {
        status: 'Error',
        result: this.error(
          call,
          'InvalidPatch',
          error instanceof Error ? error.message : 'Malformed patch',
        ),
      };
    }
    const paths: { access: 'Write'; path: WorkspacePath }[] = [];
    const changes: {
      relativePath: string;
      operation: 'Create' | 'Replace';
      beforeContent: string | null;
      afterContent: string;
      expectedVersion: string | null;
    }[] = [];
    for (const file of files) {
      const relativePath = file.path!;
      const path = await this.guard.resolve(workspaceId, relativePath, 'Write', cancellation);
      const creating = file.sourcePath === null;
      if (creating && path.exists)
        return {
          status: 'Error',
          result: this.error(
            call,
            'FileExists',
            `${relativePath} already exists; patch must modify it`,
          ),
        };
      if (!creating && !path.exists)
        return {
          status: 'Error',
          result: this.error(
            call,
            'FileNotFound',
            `${relativePath} does not exist; patch cannot modify it`,
          ),
        };
      const before = path.exists ? await this.reader.read(path, null, cancellation) : null;
      let afterContent: string;
      try {
        afterContent = applyHunks(before?.content ?? '', file.hunks);
      } catch (error) {
        return {
          status: 'Error',
          result: this.error(
            call,
            'PatchMismatch',
            `${relativePath}: ${error instanceof Error ? error.message : 'hunk does not apply'}`,
          ),
        };
      }
      paths.push({ access: 'Write', path });
      changes.push({
        relativePath: path.relativePath,
        operation: creating ? 'Create' : 'Replace',
        beforeContent: before?.content ?? null,
        afterContent,
        expectedVersion: before?.version ?? null,
      });
    }
    return this.ready(call, workspaceId, paths, { kind: 'FileChanges', changes });
  }
  protected async perform(
    prepared: PreparedToolCall,
    cancellation: CancellationToken,
  ): Promise<ToolResult> {
    const changes = prepared.preview?.kind === 'FileChanges' ? prepared.preview.changes : [];
    if (!changes.length) throw new Error('Missing patch preview');
    const applied: string[] = [];
    for (let index = 0; index < changes.length; index++) {
      const change = changes[index]!;
      const path = prepared.paths[index]?.path;
      if (!path) throw new Error('Missing resolved path for patch file');
      const result = await this.writer.replace(
        path,
        change.afterContent,
        change.expectedVersion,
        cancellation,
      );
      if (result.status === 'Error')
        return this.error(
          prepared.call,
          result.code,
          `${change.relativePath}: ${result.message}${applied.length ? ` (already applied: ${applied.join(', ')})` : ''}`,
        );
      applied.push(change.relativePath);
    }
    return this.success(prepared.call, `Applied patch to ${applied.join(', ')}`);
  }
}
