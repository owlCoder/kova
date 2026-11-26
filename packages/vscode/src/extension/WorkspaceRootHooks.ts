/**
 * Callbacks the WorkspaceRootController uses to swap the session's workspace
 * root without touching run state mid-flight.
 */
export interface WorkspaceRootHooks {
  readonly busy: () => boolean;
  readonly disposed: () => boolean;
  /** Disposes the old runtime and clears root-bound state (skills, attachments, usage). */
  readonly reset: () => Promise<void>;
  /** Rebuilds the tool runtime/skills for the new root. */
  readonly reinitialize: () => Promise<void>;
  readonly notify: () => Promise<void>;
}
