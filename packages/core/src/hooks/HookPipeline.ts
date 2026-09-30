import type { Hook } from './Hook.js';
import type { HookContext } from './HookContext.js';
import type { HookReport } from './HookReport.js';
import type { CancellationToken } from '../common/CancellationToken.js';
import type { AgentEventSink } from '../agents/AgentEventSink.js';

export class HookPipeline {
  constructor(
    private readonly before: readonly Hook[] = [],
    private readonly after: readonly Hook[] = [],
  ) {}
  async run(
    context: HookContext,
    cancellation: CancellationToken,
    events: AgentEventSink,
  ): Promise<readonly HookReport[]> {
    const reports: HookReport[] = [];
    for (const hook of context.event === 'BeforeToolExecution' ? this.before : this.after) {
      if (context.event === 'AfterToolExecution' && cancellation.isCancellationRequested) break;
      cancellation.throwIfCancellationRequested();
      let report: HookReport;
      try {
        report = await hook.run(context, cancellation);
        if (
          !['Observed', 'Vetoed', 'Failed'].includes(report.outcome) ||
          typeof report.message !== 'string'
        )
          throw new Error('Invalid hook report');
      } catch {
        report = {
          hookId: hook.id,
          event: context.event,
          outcome: 'Failed',
          message: 'Hook failed; tool execution is vetoed for a pre-hook',
          command: '',
          args: [],
          durationMs: 0,
        };
      }
      reports.push(report);
      events.emit({ type: 'HookObserved', callId: context.prepared.call.id, report });
    }
    return reports;
  }
}
