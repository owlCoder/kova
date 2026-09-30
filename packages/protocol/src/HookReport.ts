/** Hook outcomes cannot express Allow or RequireApproval, or replacement arguments. */
export interface HookReport {
  readonly hookId: string;
  readonly event: 'BeforeToolExecution' | 'AfterToolExecution';
  readonly outcome: 'Observed' | 'Vetoed' | 'Failed';
  readonly message: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly durationMs: number;
}
