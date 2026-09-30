/** Unknown capability is conservative: tools stay disabled. */
export type CapabilitySupport = 'Supported' | 'Unsupported' | 'Unknown';

export interface ModelInfo {
  readonly id: string;
  readonly displayName: string;
  readonly sizeBytes: number;
  readonly tools: CapabilitySupport;
  readonly thinking: CapabilitySupport;
  readonly maxContextTokens: number | null;
}
