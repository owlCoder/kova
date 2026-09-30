/** Estimates include role/tool framing; reconciliation never disables safety reserves. */
export interface TokenCounter {
  estimate(text: string): number;
}
