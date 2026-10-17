import { useI18n } from '../i18n/I18n.js';
import { Children, isValidElement, type ReactNode } from 'react';
import { send } from '../messaging/bridge.js';
import { Icon } from './Icon.js';

export function CodeBlock({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  const child = Children.toArray(children)[0];
  const props = isValidElement<{ className?: string; children?: ReactNode }>(child)
    ? child.props
    : null;
  const text = String(props?.children ?? '').replace(/\n$/, '');
  const language = props?.className?.replace('language-', '') ?? 'code';
  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>{language}</span>
        <button
          title={t('Copy code')}
          aria-label={t('Copy code')}
          onClick={() => send({ type: 'CopyText', text })}
        >
          <Icon name="copy" size={13} />
          {t('Copy')}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}
