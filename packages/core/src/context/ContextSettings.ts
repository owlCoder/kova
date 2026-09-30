export interface ContextSettings {
  readonly maxTokens: number;
  readonly reservedOutputTokens: number;
  readonly safetyMarginRatio: number;
  readonly maxToolOutputCharacters: number;
}
