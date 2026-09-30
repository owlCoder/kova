export type LoopStopReason = 'IterationLimit' | 'RepeatedToolCall' | 'MalformedToolCall';

export type RunOutcome =
  | { readonly status: 'Completed'; readonly runId: string }
  | { readonly status: 'Cancelled'; readonly runId: string }
  | { readonly status: 'Stopped'; readonly runId: string; readonly reason: LoopStopReason }
  | { readonly status: 'Failed'; readonly runId: string; readonly code: string };
