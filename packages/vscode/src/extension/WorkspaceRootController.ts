import type { WorkspaceRootHooks } from './WorkspaceRootHooks.js';

/**
 * Tracks the opened workspace folder for a chat session. A root change while
 * a run or setup is in flight is queued and applied once the session is idle,
 * so the agent never swaps its tool runtime mid-run.
 */

export class WorkspaceRootController {
  private root: string | null;
  private pending: string | null | undefined;
  constructor(
    initial: string | null,
    private readonly hooks: WorkspaceRootHooks,
  ) {
    this.root = initial;
  }
  get current(): string | null {
    return this.root;
  }
  async setRoot(root: string | null): Promise<void> {
    if (root === this.root || this.hooks.disposed()) return;
    if (this.hooks.busy()) {
      this.pending = root;
      return;
    }
    await this.apply(root);
    await this.hooks.notify();
  }
  async applyPending(): Promise<void> {
    if (this.pending === undefined || this.hooks.disposed()) return;
    const root = this.pending;
    this.pending = undefined;
    if (root !== this.root) {
      await this.apply(root);
      await this.hooks.notify();
    }
  }
  private async apply(root: string | null): Promise<void> {
    this.root = root;
    await this.hooks.reset();
    await this.hooks.reinitialize();
  }
}
