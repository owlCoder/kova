export interface ContextUsage {
  readonly maxTokens: number;
  readonly inputBudgetTokens: number;
  readonly estimatedInputTokens: number;
  readonly toolDefinitionTokens: number;
  readonly reservedOutputTokens: number;
  readonly safetyMarginTokens: number;
  readonly actualInputTokens: number | null;
  readonly actualOutputTokens: number | null;
  readonly evictions: readonly {
    readonly label: string;
    readonly action: 'Stubbed' | 'Truncated' | 'Compacted';
  }[];
}
