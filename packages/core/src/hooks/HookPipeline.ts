import type { CancellationToken } from '../common/CancellationToken.js';
import type { HookContext } from './HookContext.js';
import type { HookReport } from './HookReport.js';

export interface HookPipeline {
  run(
    context: HookContext,
    cancellation: CancellationToken,
  ): Promise<{
    readonly reports: readonly HookReport[];
    readonly vetoReasons: readonly string[];
  }>;
}
