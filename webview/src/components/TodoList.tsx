import { memo } from 'react';
import { useI18n } from '../i18n/I18n.js';
import type { TodosEntry } from '../state/timeline.js';
import { Icon } from './Icon.js';

/**
 * The agent's plan as a checklist. Updates replace the single todos entry, so
 * statuses flip live while the run is in flight.
 */
export const TodoList = memo(function TodoList({ entry }: { entry: TodosEntry }) {
  const { t } = useI18n();
  const done = entry.items.filter((item) => item.status === 'completed').length;
  return (
    <div className="todo-list">
      <div className="todo-head">
        <Icon name="plan" size={13} />
        <strong>{t('Plan')}</strong>
        <span className="todo-count">
          {t('{done} of {total} done', { done: String(done), total: String(entry.items.length) })}
        </span>
      </div>
      <ul>
        {entry.items.map((item) => (
          <li key={item.id} className={`todo-${item.status}`}>
            <span className="todo-mark" aria-hidden="true">
              {item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '…' : '·'}
            </span>
            <span className="todo-content">{item.content}</span>
          </li>
        ))}
      </ul>
    </div>
  );
});
