import { memo, useDeferredValue } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { send } from '../messaging/bridge.js';
import { CodeBlock } from './CodeBlock.js';

export const MessageContent = memo(function MessageContent({ text }: { text: string }) {
  const deferred = useDeferredValue(text);
  return (
    <div className="message-content markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          pre: CodeBlock,
          a: ({ href, children }) =>
            href && /^https?:\/\//i.test(href) ? (
              <a
                href={href}
                onClick={(event) => {
                  event.preventDefault();
                  send({ type: 'OpenExternal', url: href });
                }}
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => <span className="image-placeholder">{alt || 'Image attachment'}</span>,
        }}
      >
        {deferred}
      </ReactMarkdown>
    </div>
  );
});
