export interface ConversationSummary {
  readonly goal: string;
  readonly filesInspected: readonly string[];
  readonly changes: readonly string[];
  readonly outstanding: readonly string[];
  readonly throughTurnId: string;
}
