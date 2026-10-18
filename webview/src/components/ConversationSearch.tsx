import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Icon } from './Icon.js';
import { useI18n } from '../i18n/I18n.js';
import { findTextMatches } from './findTextMatches.js';

export function ConversationSearch({
  scroller,
  revision,
  onClose,
}: {
  scroller: RefObject<HTMLDivElement | null>;
  revision: unknown;
  onClose(): void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [count, setCount] = useState(0);
  const [active, setActive] = useState(0);
  const ranges = useRef<Range[]>([]);
  const field = useRef<HTMLInputElement>(null);
  const selection = useRef({ query: '', index: 0 });
  useLayoutEffect(() => field.current?.focus(), []);
  useEffect(() => {
    const timer = setTimeout(() => {
      const next: Range[] = [];
      for (const content of scroller.current?.querySelectorAll('.message-content') ?? []) {
        if (!query.trim() || next.length >= 500) break;
        const nodes: { node: Text; start: number; end: number }[] = [];
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
        let text = '';
        while (walker.nextNode()) {
          const node = walker.currentNode as Text;
          if (node.parentElement?.closest('.code-toolbar')) continue;
          nodes.push({ node, start: text.length, end: text.length + node.length });
          text += node.data;
        }
        for (const match of findTextMatches(text, query, 500 - next.length)) {
          const start = nodes.find((node) => node.end > match.start);
          const end = nodes.find((node) => node.end >= match.end);
          if (!start || !end) continue;
          const range = document.createRange();
          range.setStart(start.node, match.start - start.start);
          range.setEnd(end.node, match.end - end.start);
          next.push(range);
        }
      }
      ranges.current = next;
      setCount(next.length);
      const changed = selection.current.query !== query;
      const index = changed ? 0 : Math.max(0, Math.min(selection.current.index, next.length - 1));
      selection.current = { query, index };
      setActive(index);
      if (typeof Highlight !== 'undefined')
        CSS.highlights.set('kova-search', new Highlight(...next));
      // A refreshed streaming answer can invalidate old ranges even if the count is unchanged.
      if (typeof Highlight !== 'undefined') {
        CSS.highlights.delete('kova-search-active');
        if (next[index]) CSS.highlights.set('kova-search-active', new Highlight(next[index]!));
      }
      if (changed) next[index]?.startContainer.parentElement?.scrollIntoView({ block: 'center' });
    }, 120);
    return () => clearTimeout(timer);
  }, [query, revision, scroller]);
  useEffect(
    () => () => {
      if (typeof Highlight !== 'undefined') {
        CSS.highlights.delete('kova-search');
        CSS.highlights.delete('kova-search-active');
      }
    },
    [],
  );
  const move = (direction: number) => {
    if (!ranges.current.length) return;
    const index = (active + direction + ranges.current.length) % ranges.current.length;
    setActive(index);
    selection.current.index = index;
    const range = ranges.current[index]!;
    if (typeof Highlight !== 'undefined')
      CSS.highlights.set('kova-search-active', new Highlight(range));
    range.startContainer.parentElement?.scrollIntoView({ block: 'center' });
  };
  return (
    <div
      className="conversation-search"
      role="search"
      aria-label={t('Find in conversation')}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          move(event.shiftKey ? -1 : 1);
        }
      }}
    >
      <Icon name="search" size={15} />
      <input
        ref={field}
        value={query}
        maxLength={128}
        aria-label={t('Find in conversation')}
        placeholder={t('Find in conversation…')}
        onChange={(event) => setQuery(event.target.value)}
      />
      <span className="search-count" role="status" aria-live="polite">
        {query.trim()
          ? count
            ? `${active + 1}/${count}${count === 500 ? '+' : ''}`
            : t('No matches')
          : t('Find text')}
      </span>
      <button
        className="icon-button"
        disabled={!count}
        title={t('Previous match (Shift+Enter)')}
        aria-label={t('Previous match (Shift+Enter)')}
        onClick={() => move(-1)}
      >
        <Icon name="up" size={14} />
      </button>
      <button
        className="icon-button"
        disabled={!count}
        title={t('Next match (Enter)')}
        aria-label={t('Next match (Enter)')}
        onClick={() => move(1)}
      >
        <Icon name="down" size={14} />
      </button>
      <button
        className="icon-button"
        title={t('Close search')}
        aria-label={t('Close search')}
        onClick={onClose}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
