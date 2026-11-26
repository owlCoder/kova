import { useEffect, useRef } from 'react';
import type { ApprovalView } from '../../../packages/protocol/src/ApprovalView.js';
import { send } from '../messaging/bridge.js';
import { useI18n } from '../i18n/I18n.js';
import { Icon } from './Icon.js';
import { toolLabel } from './toolLabel.js';
import { ApprovalDiff } from './ApprovalDiff.js';

/**
 * Inline permission question. Keys 1 and 2 answer it and Escape rejects, but
 * only while focus is inside the prompt, so typing in the composer is safe.
 */
export function ApprovalPrompt({ approval }: { approval: ApprovalView }) {
  const { t } = useI18n();
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    root.current?.querySelector<HTMLButtonElement>('.approval-option')?.focus({
      preventScroll: true,
    });
  }, [approval.approvalId]);
  const resolve = (decision: 'AllowOnce' | 'Reject') =>
    send({
      type: 'ResolveApproval',
      runId: approval.runId,
      approvalId: approval.approvalId,
      preparationKey: approval.preparationKey,
      decision,
    });
  const preview = approval.preview;
  const question =
    preview?.kind === 'Command'
      ? t('Run this command?')
      : preview?.kind === 'FileChanges'
        ? t('Apply these changes?')
        : t('Allow {tool}?', { tool: toolLabel(approval.toolName) });
  return (
    <section
      ref={root}
      className={`approval-prompt risk-${approval.risk.toLowerCase()}`}
      aria-label={t('Permission request')}
      onKeyDown={(event) => {
        const decision =
          event.key === '1'
            ? 'AllowOnce'
            : event.key === '2' || event.key === 'Escape'
              ? 'Reject'
              : null;
        if (!decision || event.metaKey || event.ctrlKey || event.altKey) return;
        // Answering here must not also interrupt the run through the global Escape handler.
        event.preventDefault();
        event.stopPropagation();
        resolve(decision);
      }}
    >
      <header>
        <span className="tool-name">{toolLabel(approval.toolName)}</span>
        <span className="approval-risk">
          {t(
            {
              ReadOnly: 'Read only',
              WorkspaceWrite: 'Changes files',
              ProcessExecution: 'Runs a process',
              Destructive: 'Destructive',
            }[approval.risk] ?? approval.risk,
          )}
        </span>
      </header>
      {preview?.kind === 'Command' && (
        <pre className="approval-command">
          <span className="prompt-sign">$</span> {preview.command}
          {preview.relativeWorkingDirectory !== '.' && (
            <small> · {preview.relativeWorkingDirectory}</small>
          )}
        </pre>
      )}
      {preview?.kind === 'FileChanges' && (
        <>
          {preview.changes.map((change) => (
            <ApprovalDiff key={change.relativePath} change={change} />
          ))}
          <button
            className="approval-diff"
            onClick={() => send({ type: 'OpenDiffPreview', approvalId: approval.approvalId })}
          >
            <Icon name="review" size={14} />
            <span>
              {preview.relativePaths.length === 1
                ? preview.relativePaths[0]
                : t('{count} files', { count: preview.relativePaths.length })}
            </span>
            <span className="approval-diff-action">{t('Open diff')}</span>
          </button>
        </>
      )}
      {preview?.kind === 'Description' && <p>{preview.text}</p>}
      {!!approval.reasons.length && (
        <p className="approval-reasons">{approval.reasons.join(' · ')}</p>
      )}
      <p className="approval-question">{question}</p>
      <div className="approval-options" role="group" aria-label={question}>
        <button className="approval-option" onClick={() => resolve('AllowOnce')}>
          <kbd>1</kbd>
          <span>{t('Yes, allow once')}</span>
        </button>
        <button className="approval-option" onClick={() => resolve('Reject')}>
          <kbd>2</kbd>
          <span>{t('No, reject')}</span>
        </button>
      </div>
      <small className="approval-hint">{t('Esc to reject')}</small>
    </section>
  );
}
