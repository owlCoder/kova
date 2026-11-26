/** One step of the agent's visible plan; statuses render as a checklist. */
export interface TodoItem {
  readonly id: string;
  readonly content: string;
  readonly status: 'pending' | 'in_progress' | 'completed';
}
