import { memo } from 'react';
import { useI18n } from '../i18n/I18n.js';
import type { ToolEntry } from '../state/timeline.js';
import { toolLabel } from './toolLabel.js';

/**
 * One transcript line per tool call: status dot, tool and arguments, then an
 * always-visible result line; multi-line output folds open on demand.
 */
export const ToolCallRow = memo(function ToolCallRow({ entry }: { entry: ToolEntry }) {
  const { t } = useI18n();
  const body = (entry.detail || entry.output).trimEnd();
  const lines = body ? body.split('\n') : [];
  const status = {
    Requested: t('Preparing…'),
    AwaitingApproval: t('Waiting for your approval'),
    Running: t('Running…'),
    Success:
      lines.length > 1
        ? t('{count} lines', { count: lines.length })
        : lines[0] ||
          (entry.durationMs === null ? t('Done') : t('Done in {ms} ms', { ms: entry.durationMs })),
    Error: entry.detail || t('Failed'),
    Blocked: t('Blocked by policy'),
    Denied: t('Rejected by you'),
    Cancelled: t('Interrupted'),
  }[entry.status];
  const foldable = entry.status === 'Success' && lines.length > 1;
  return (
    <div className={`tool-row tool-${entry.status.toLowerCase()}`}>
      <div className="tool-head">
        <span className="tool-dot" aria-hidden="true" />
        <span className="tool-name">{toolLabel(entry.toolName)}</span>
        {entry.summary && (
          <span className="tool-args" title={entry.summary}>
            {entry.summary}
          </span>
        )}
        {entry.source && entry.source !== 'Built-in' && (
          <span className="tool-source">{entry.source}</span>
        )}
      </div>
      {foldable ? (
        <details className="tool-result">
          <summary>
            <span className="tool-elbow" aria-hidden="true">
              ⎿
            </span>
            <span className="tool-status">{status}</span>
            <span className="tool-expand">{t('show output')}</span>
          </summary>
          <pre>{body}</pre>
          {entry.omitted > 0 && (
            <small className="tool-omitted">
              {t('{count} more characters not shown', { count: entry.omitted })}
            </small>
          )}
        </details>
      ) : (
        <div className="tool-result">
          <span className="tool-elbow" aria-hidden="true">
            ⎿
          </span>
          <span className="tool-status">{status}</span>
        </div>
      )}
    </div>
  );
});
