export interface ToolOutputLimiter {
  limit(
    output: string,
    maxCharacters: number,
  ): { readonly text: string; readonly omittedCharacters: number };
}
