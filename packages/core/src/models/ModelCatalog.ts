import type { CancellationToken } from '../common/CancellationToken.js';
import type { ModelInfo } from './ModelInfo.js';

export interface ModelCatalog {
  listAvailable(cancellation: CancellationToken): Promise<readonly ModelInfo[]>;
}
