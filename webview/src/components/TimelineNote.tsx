import { memo } from 'react';
import { useI18n } from '../i18n/I18n.js';
import type { NoteEntry } from '../state/timeline.js';

/** Quiet lifecycle line (rules, hooks, MCP, interruptions) between transcript items. */
export const TimelineNote = memo(function TimelineNote({ entry }: { entry: NoteEntry }) {
  const { t } = useI18n();
  const text = t(entry.text, entry.values);
  if (!entry.detail)
    return (
      <div className={`timeline-note note-${entry.tone}`}>
        <span className="note-mark" aria-hidden="true" />
        <span>{text}</span>
      </div>
    );
  return (
    <details className={`timeline-note note-${entry.tone}`}>
      <summary>
        <span className="note-mark" aria-hidden="true" />
        <span>{text}</span>
      </summary>
      <pre>{entry.detail}</pre>
    </details>
  );
});
