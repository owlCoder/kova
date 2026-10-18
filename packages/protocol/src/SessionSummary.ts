/** Conversation metadata, without message bodies or provider credentials. */
export interface SessionSummary {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly workspaceId: string;
  readonly pinned: boolean;
}
