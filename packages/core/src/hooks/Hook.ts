import type { CancellationToken } from '../common/CancellationToken.js';
import type { HookContext } from './HookContext.js';
import type { HookReport } from './HookReport.js';

export interface Hook {
  readonly id: string;
  run(context: HookContext, cancellation: CancellationToken): Promise<HookReport>;
}
