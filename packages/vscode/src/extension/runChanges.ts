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
  private lastCompleted: { runId: string; files: readonly RunFileChange[] } | null = null;
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

  onRunFinished(runId: string): void {
    const files = this.runs.get(runId);
    if (files && files.size) {
      this.lastCompleted = {
        runId,
        files: [...files.entries()].map(([path, created]) => ({ path, created })),
      };
    }
    while (this.runs.size > 5) this.runs.delete(this.runs.keys().next().value!);
  }

  latest(): { runId: string; files: readonly RunFileChange[] } | null {
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
    if (!files.length) throw new Error('No recorded file changes for this run.');
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
    this.runs.delete(runId);
    if (this.lastCompleted?.runId === runId) this.lastCompleted = null;
    return `Reverted ${files.length} file${files.length === 1 ? '' : 's'} from the run.`;
  }
}
