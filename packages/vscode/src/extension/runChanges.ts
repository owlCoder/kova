import { CancellationSource } from '../../../core/src/common/CancellationSource.js';
import type { RunChangeTrackerDeps } from './RunChangeTrackerDeps.js';
import { NodeWorkspacePathGuard } from '../../../runtime/src/adapters/NodeWorkspacePathGuard.js';
import { NodeProcessRunner } from '../../../runtime/src/adapters/NodeProcessRunner.js';
import * as vscode from 'vscode';

export interface RunFileChange {
  readonly path: string;
  readonly created: boolean;
}

const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'apply_patch']);

/** Extracts the workspace-relative paths a write tool call targets. */
export function toolCallPaths(toolName: string, args: unknown): string[] {
  if (!WRITE_TOOLS.has(toolName)) return [];
  const record = args as Record<string, unknown> | null;
  if (!record || typeof record !== 'object') return [];
  if (typeof record.path === 'string') return [record.path];
  if (typeof record.patch === 'string')
    return [...record.patch.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((match) => match[1]!.trim());
  return [];
}

/**
 * Tracks which files each run's write tools touched (and whether they existed
 * before), so a completed run can be reverted safely: tracked/existing files
 * go through `git checkout`, files created by the run are deleted.
 */
export class RunChangeTracker {
  private readonly pending = new Map<
    string,
    { runId: string; tool: string; args: unknown; existed: Map<string, boolean> }
  >();
  private readonly runs = new Map<string, Map<string, boolean>>();
  private readonly checkpoints = new Map<string, string>();
  private lastCompleted: {
    runId: string;
    files: readonly RunFileChange[];
    checkpointed: boolean;
  } | null = null;
  constructor(
    private readonly root: () => string | null,
    private readonly deps: RunChangeTrackerDeps = {},
  ) {}

  onToolRequested(runId: string | null, callId: string, toolName: string, args: unknown): void {
    if (!runId) return;
    const paths = toolCallPaths(toolName, args);
    if (!paths.length) return;
    const existed = new Map<string, boolean>();
    this.pending.set(callId, { runId, tool: toolName, args, existed });
    const root = this.root();
    if (!root) return;
    const guard = new NodeWorkspacePathGuard(root);
    const cancellation = new CancellationSource();
    void (async () => {
      for (const path of paths) {
        try {
          const resolved = await guard.resolve(root, path, 'Read', cancellation);
          existed.set(path, resolved.exists);
        } catch {
          // Outside the root: the tool itself rejects it and revert skips it too.
        }
      }
    })();
  }

  onToolCompleted(runId: string | null, callId: string, success: boolean): void {
    const pending = this.pending.get(callId);
    this.pending.delete(callId);
    if (!pending || !success || pending.runId !== runId) return;
    const files = this.runs.get(pending.runId) ?? new Map<string, boolean>();
    for (const path of toolCallPaths(pending.tool, pending.args))
      files.set(path, !pending.existed.get(path));
    this.runs.set(pending.runId, files);
  }

  /**
   * Snapshots the working tree with `git stash create` when a run starts, so
   * revert can fall back to `git stash apply <sha>` if per-file checkout fails.
   */
  onRunStarted(runId: string): void {
    const root = this.root();
    if (!root) return;
    const cancellation = new CancellationSource();
    const pending = this.deps.gitStashCreate
      ? this.deps.gitStashCreate(root, cancellation)
      : new NodeProcessRunner(root)
          .run(
            {
              workspaceId: root,
              command: 'git',
              args: ['stash', 'create'],
              workingDirectory: root,
              timeoutMs: 15_000,
              maxOutputCharacters: 200,
            },
            cancellation,
          )
          .then((result) =>
            result.exitCode === 0 && result.stdout.trim() ? result.stdout.trim() : null,
          )
          .catch(() => null);
    void pending.then((sha) => {
      if (sha) this.checkpoints.set(runId, sha);
    });
  }

  onRunFinished(runId: string): void {
    const files = this.runs.get(runId);
    if (files && files.size) {
      this.lastCompleted = {
        runId,
        files: [...files.entries()].map(([path, created]) => ({ path, created })),
        checkpointed: this.checkpoints.has(runId),
      };
    }
    while (this.runs.size > 5) {
      const oldest = this.runs.keys().next().value!;
      this.runs.delete(oldest);
      this.checkpoints.delete(oldest);
    }
  }

  latest(): {
    runId: string;
    files: readonly RunFileChange[];
    checkpointed: boolean;
  } | null {
    return this.lastCompleted;
  }

  filesFor(runId: string): readonly RunFileChange[] {
    if (this.lastCompleted?.runId === runId) return this.lastCompleted.files;
    const files = this.runs.get(runId);
    return files ? [...files.entries()].map(([path, created]) => ({ path, created })) : [];
  }

  /** Reverts one run's changes after user confirmation; returns a summary. */
  async revert(
    runId: string,
    confirm?: (files: readonly RunFileChange[]) => Promise<boolean>,
  ): Promise<string> {
    const root = this.root();
    if (!root) throw new Error('Open a workspace to revert changes.');
    const files = this.filesFor(runId);
    const checkpoint = this.checkpoints.get(runId) ?? null;
    if (!files.length && !checkpoint) throw new Error('No recorded file changes for this run.');
    const agreed = confirm
      ? await confirm(files)
      : await (async () => {
          const list = files
            .slice(0, 10)
            .map((file) => file.path)
            .join(', ');
          const choice = await vscode.window.showWarningMessage(
            `Revert ${files.length} file change(s) from this run? ${list}`,
            { modal: true },
            'Revert',
          );
          return choice === 'Revert';
        })();
    if (!agreed) return 'Revert cancelled.';
    const guard = new NodeWorkspacePathGuard(root);
    const cancellation = new CancellationSource();
    const applyCheckpoint = async (): Promise<void> => {
      if (!checkpoint) throw new Error('No git checkpoint recorded for this run.');
      if (this.deps.gitStashApply) {
        await this.deps.gitStashApply(root, checkpoint, cancellation);
        return;
      }
      const result = await new NodeProcessRunner(root).run(
        {
          workspaceId: root,
          command: 'git',
          args: ['stash', 'apply', checkpoint],
          workingDirectory: root,
          timeoutMs: 30_000,
          maxOutputCharacters: 4_000,
        },
        cancellation,
      );
      if (result.exitCode !== 0)
        throw new Error(`git stash apply failed: ${result.stderr.slice(0, 200)}`);
    };
    try {
      if (!files.length) {
        await applyCheckpoint();
      } else {
        const checkout: string[] = [];
        const unlink: string[] = [];
        for (const file of files) {
          const resolved = await guard.resolve(root, file.path, 'Write', cancellation);
          if (file.created) unlink.push(resolved.canonicalPath);
          else checkout.push(resolved.relativePath);
        }
        if (checkout.length) {
          if (this.deps.gitCheckout) await this.deps.gitCheckout(root, checkout, cancellation);
          else {
            const result = await new NodeProcessRunner(root).run(
              {
                workspaceId: root,
                command: 'git',
                args: ['checkout', '--', ...checkout],
                workingDirectory: root,
                timeoutMs: 15_000,
                maxOutputCharacters: 4_000,
              },
              cancellation,
            );
            if (result.exitCode !== 0)
              throw new Error(`git checkout failed: ${result.stderr.slice(0, 200)}`);
          }
        }
        for (const path of unlink) await vscode.workspace.fs.delete(vscode.Uri.file(path));
      }
    } catch (error) {
      // Per-file revert could not restore everything; fall back to the checkpoint.
      if (!checkpoint) throw error;
      await applyCheckpoint();
    }
    this.runs.delete(runId);
    this.checkpoints.delete(runId);
    if (this.lastCompleted?.runId === runId) this.lastCompleted = null;
    return checkpoint && !files.length
      ? 'Reverted the run from its git checkpoint.'
      : `Reverted ${files.length} file${files.length === 1 ? '' : 's'} from the run.`;
  }
}
