import { describe, expect, it } from 'vitest';
import {
  isEditableTarget,
  nextMessageIndex,
  transcriptShortcut,
} from '../../webview/src/state/transcriptShortcuts.js';

describe('transcriptShortcut', () => {
  it('maps arrow keys to message navigation', () => {
    expect(transcriptShortcut('ArrowDown', false)).toEqual({
      type: 'focusMessage',
      direction: 1,
    });
    expect(transcriptShortcut('ArrowUp', false)).toEqual({ type: 'focusMessage', direction: -1 });
  });

  it('maps e and r to edit and resend the last user message', () => {
    expect(transcriptShortcut('e', false)).toEqual({ type: 'editLastUserMessage' });
    expect(transcriptShortcut('R', false)).toEqual({ type: 'resendLastUserMessage' });
  });

  it('ignores keys while typing in an editable target', () => {
    expect(transcriptShortcut('e', true)).toBeNull();
    expect(transcriptShortcut('ArrowUp', true)).toBeNull();
  });

  it('ignores unrelated keys', () => {
    expect(transcriptShortcut('x', false)).toBeNull();
    expect(transcriptShortcut('Enter', false)).toBeNull();
  });
});

describe('isEditableTarget', () => {
  const field = { closest: (selector: string) => (selector.includes('textarea') ? {} : null) };
  it('detects editable elements', () => {
    expect(isEditableTarget(field)).toBe(true);
    expect(isEditableTarget({ closest: () => null })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget({})).toBe(false);
  });
});

describe('nextMessageIndex', () => {
  it('starts at the first or last message when nothing is focused', () => {
    expect(nextMessageIndex(-1, 1, 5)).toBe(0);
    expect(nextMessageIndex(-1, -1, 5)).toBe(4);
    expect(nextMessageIndex(-1, 1, 0)).toBe(-1);
  });

  it('clamps movement at both ends', () => {
    expect(nextMessageIndex(0, -1, 5)).toBe(0);
    expect(nextMessageIndex(4, 1, 5)).toBe(4);
    expect(nextMessageIndex(2, 1, 5)).toBe(3);
    expect(nextMessageIndex(2, -1, 5)).toBe(1);
  });
});
