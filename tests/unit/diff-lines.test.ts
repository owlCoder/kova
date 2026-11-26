import { describe, expect, it } from 'vitest';
import { diffLines } from '../../webview/src/components/diffLines.js';
import { capDiffText } from '../../packages/runtime/src/presentation/capDiffText.js';

describe('diffLines', () => {
  it('pairs unchanged lines and marks edits', () => {
    const { rows, truncated } = diffLines('a\nb\nc', 'a\nx\nc');
    expect(truncated).toBe(false);
    expect(rows).toEqual([
      { left: 'a', right: 'a', kind: 'same' },
      { left: 'b', right: null, kind: 'removed' },
      { left: null, right: 'x', kind: 'added' },
      { left: 'c', right: 'c', kind: 'same' },
    ]);
  });

  it('treats a null before-text as a new file', () => {
    const { rows } = diffLines(null, 'one\ntwo');
    expect(rows).toEqual([
      { left: null, right: 'one', kind: 'added' },
      { left: null, right: 'two', kind: 'added' },
    ]);
  });

  it('marks pure removals', () => {
    const { rows } = diffLines('a\nb', 'a');
    expect(rows).toEqual([
      { left: 'a', right: 'a', kind: 'same' },
      { left: 'b', right: null, kind: 'removed' },
    ]);
  });

  it('caps the row count and reports truncation', () => {
    const after = Array.from({ length: 50 }, (_, i) => `line-${i}`).join('\n');
    const { rows, truncated } = diffLines(null, after, 10);
    expect(rows).toHaveLength(10);
    expect(truncated).toBe(true);
  });
});

describe('capDiffText', () => {
  it('keeps short text intact', () => {
    expect(capDiffText('a\nb')).toEqual({ text: 'a\nb', truncated: false });
  });

  it('caps by lines', () => {
    const text = Array.from({ length: 300 }, (_, i) => `l${i}`).join('\n');
    const { text: capped, truncated } = capDiffText(text);
    expect(truncated).toBe(true);
    expect(capped.split('\n')).toHaveLength(200);
    expect(capped.startsWith('l0')).toBe(true);
  });

  it('caps by characters', () => {
    const { text: capped, truncated } = capDiffText('x'.repeat(20_000), 500, 100);
    expect(truncated).toBe(true);
    expect(capped).toHaveLength(100);
  });
});
