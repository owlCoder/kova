import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { ProjectInstructionsRepository } from '../../../core/src/workspace/ProjectInstructionsRepository.js';
import { BoundedTextFile } from './BoundedTextFile.js';
import { NodeWorkspacePathGuard } from './NodeWorkspacePathGuard.js';

const maxBytes = 16_000;

/** Reads AGENTS.md from the workspace root; a missing file is the normal case, not an error. */
export class WorkspaceProjectInstructions implements ProjectInstructionsRepository {
  private readonly guard: NodeWorkspacePathGuard;
  constructor(
    private readonly root: string,
    private readonly diagnostic: (message: string) => void = () => {},
  ) {
    this.guard = new NodeWorkspacePathGuard(root);
  }
  async read(_workspaceId: string, cancellation: CancellationToken): Promise<string | null> {
    let path: string;
    try {
      path = (await this.guard.resolve(this.root, 'AGENTS.md', 'Read', cancellation)).canonicalPath;
    } catch (error) {
      cancellation.throwIfCancellationRequested();
      if (!(error instanceof Error) || error.message !== 'Workspace path does not exist')
        this.diagnostic(`AGENTS.md: ${error instanceof Error ? error.message : 'Unreadable.'}`);
      return null;
    }
    try {
      const { content } = await new BoundedTextFile().read(path, cancellation, maxBytes);
      return content.trim() || null;
    } catch {
      cancellation.throwIfCancellationRequested();
      this.diagnostic(
        `AGENTS.md is not loaded: it must be a text file of at most ${maxBytes} bytes.`,
      );
      return null;
    }
  }
}
