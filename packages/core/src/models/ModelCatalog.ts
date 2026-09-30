import type { CancellationToken } from '../common/CancellationToken.js';
import type { ModelInfo } from './ModelInfo.js';

export interface ModelCatalog {
  listInstalled(cancellation: CancellationToken): Promise<readonly ModelInfo[]>;
}
