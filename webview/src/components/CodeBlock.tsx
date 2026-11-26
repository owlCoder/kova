import { Children, Fragment, isValidElement, useMemo, type ReactNode } from 'react';
import { CopyButton } from './CopyButton.js';
import { highlightTokens } from './syntaxHighlight.js';

/**
 * Fenced code block with a language tag, copy button and local syntax
 * highlighting. Tokens are rendered as React spans (never innerHTML), so
 * the webview CSP stays intact.
 */
export function CodeBlock({ children }: { children?: ReactNode }) {
  const child = Children.toArray(children)[0];
  const props = isValidElement<{ className?: string; children?: ReactNode }>(child)
    ? child.props
    : null;
  const text = String(props?.children ?? '').replace(/\n$/, '');
  const language = props?.className?.replace('language-', '') ?? 'code';
  const tokens = useMemo(() => highlightTokens(text, language), [text, language]);
  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>{language}</span>
        <CopyButton label="Copy code" caption="Copy" text={text} />
      </div>
      <pre>
        <code className={`language-${language}`}>
          {tokens.map((token, index) =>
            token.kind === 'plain' ? (
              <Fragment key={index}>{token.text}</Fragment>
            ) : (
              <span key={index} className={`tok-${token.kind}`}>
                {token.text}
              </span>
            ),
          )}
        </code>
      </pre>
    </div>
  );
}
