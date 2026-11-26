import type { FileChangePreview } from '../../../packages/protocol/src/FileChangePreview.js';
import { useI18n } from '../i18n/I18n.js';
import { diffLines } from './diffLines.js';

/** Side-by-side before/after preview for one file in an approval request. */
export function ApprovalDiff({ change }: { readonly change: FileChangePreview }) {
  const { t } = useI18n();
  const { rows, truncated } = diffLines(change.before, change.after);
  return (
    <div className="approval-file-diff">
      <div className="approval-file-head">
        <span className="approval-file-path">{change.relativePath}</span>
        <span className={`approval-file-op op-${change.operation.toLowerCase()}`}>
          {change.operation === 'Create' ? t('New file') : t('Replace')}
        </span>
      </div>
      <table className="diff-table">
        <thead>
          <tr>
            <th>{t('Before')}</th>
            <th>{t('After')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className={`diff-${row.kind}`}>
              <td>{row.left ?? ' '}</td>
              <td>{row.right ?? ' '}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(truncated || change.truncated) && (
        <p className="approval-diff-truncated">{t('Preview truncated')}</p>
      )}
    </div>
  );
}
