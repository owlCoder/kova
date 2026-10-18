import { Children, isValidElement, type ReactNode } from 'react';
import { CopyButton } from './CopyButton.js';

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
        <CopyButton label="Copy code" caption="Copy" text={text} />
      </div>
      <pre>{children}</pre>
    </div>
  );
}
