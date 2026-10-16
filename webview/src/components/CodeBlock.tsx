import { Children, isValidElement, type ReactNode } from 'react';
import { send } from '../messaging/bridge.js';
import { Icon } from './Icon.js';

export function CodeBlock({ children }: { children?: ReactNode }) {
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
          title="Copy code"
          aria-label="Copy code"
          onClick={() => send({ type: 'CopyText', text })}
        >
          <Icon name="copy" size={13} />
          Copy
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}
