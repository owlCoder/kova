export interface HookCommand {
  readonly id: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
}

export interface HookConfiguration {
  readonly BeforeToolExecution: readonly HookCommand[];
  readonly AfterToolExecution: readonly HookCommand[];
}
