import type { ProviderKind } from './ProviderKind.js';

export interface ProviderConfiguration {
  readonly kind: ProviderKind;
  readonly label: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly supportsTools: boolean;
  readonly discoverModels: boolean;
}
