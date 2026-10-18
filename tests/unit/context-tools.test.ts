import { describe, expect, it } from 'vitest';
import { mergeContextAttachments } from '../../packages/runtime/src/presentation/mergeContextAttachments.js';
import { contextAttachmentViews } from '../../packages/runtime/src/presentation/contextAttachmentViews.js';
import { previewContext } from '../../packages/runtime/src/presentation/previewContext.js';
import { nextStreamingMessage } from '../../packages/runtime/src/presentation/nextStreamingMessage.js';
import { validateMessage } from '../../packages/runtime/src/presentation/validateMessage.js';
import type { ContextAttachment } from '../../packages/core/src/context/ContextAttachment.js';

const conversationId = '11111111-1111-4111-8111-111111111111';
const item: ContextAttachment = {
  id: 'file',
  label: 'src/example.ts',
  source: 'ExplicitFile',
  content: 'original',
};
describe('captured attachment presentation', () => {
  it('sends metadata only, then previews an authoritative bounded snapshot on explicit request', () => {
    const captured = { ...item, content: '<script>untrusted()</script>\n' + 'č'.repeat(60_000) };
    const views = contextAttachmentViews([captured]);
    expect(views[0]).toEqual({
      id: 'file',
      label: 'src/example.ts',
      source: 'ExplicitFile',
      characters: captured.content.length,
    });
    expect(JSON.stringify(views)).not.toContain('untrusted');
    const preview = previewContext(conversationId, [captured], {
      type: 'PreviewContext',
      protocolVersion: 1,
      requestId: 'preview',
      conversationId,
      attachmentId: 'file',
    });
    expect(preview.content).toHaveLength(50_000);
    expect(preview.content).toBe(captured.content.slice(0, 50_000));
    expect(preview).toMatchObject({ truncated: true, characters: captured.content.length });
    expect(captured.content.length).toBeGreaterThan(preview.content.length);
  });
  it('rejects stale conversation/attachment references and injected file paths or content', () => {
    const request = {
      type: 'PreviewContext' as const,
      protocolVersion: 1 as const,
      requestId: 'preview',
      conversationId,
      attachmentId: 'file',
    };
    expect(validateMessage(request).type).toBe('PreviewContext');
    expect(() => previewContext('another-conversation', [item], request)).toThrow(
      'no longer selected',
    );
    expect(() => previewContext(conversationId, [], request)).toThrow('no longer available');
    for (const injected of [
      { path: '/private/file' },
      { content: 'forged snapshot' },
      { conversationId: '../escape' },
    ])
      expect(() => validateMessage({ ...request, ...injected })).toThrow();
  });
  it('refreshes file contents without changing the attachment ID and retains distinct selections', () => {
    const initial = [
      item,
      { ...item, id: 'selected', source: 'Selection' as const, content: 'selection' },
    ];
    const refreshed = mergeContextAttachments(initial, [
      { ...item, id: 'new-id', source: 'CurrentFile', content: 'updated buffer' },
      { ...item, id: 'duplicate', source: 'Selection', content: 'selection' },
      { ...item, id: 'different', source: 'Selection', content: 'another range' },
    ]);
    expect(refreshed).toHaveLength(3);
    expect(refreshed[0]).toMatchObject({ id: 'file', content: 'updated buffer' });
    expect(refreshed[1]?.id).toBe('selected');
    expect(initial[0]?.content).toBe('original');
  });
  it('applies batches atomically and permits refreshing a full collection', () => {
    const full = Array.from({ length: 10 }, (_, i) => ({ ...item, id: `${i}`, label: `${i}.ts` }));
    expect(mergeContextAttachments(full, [{ ...full[0]!, content: 'fresh' }])).toHaveLength(10);
    expect(() => mergeContextAttachments(full, [{ ...item, label: 'eleventh.ts' }])).toThrow('10');
    expect(() =>
      mergeContextAttachments(
        [item],
        [
          { ...item, label: 'new.ts' },
          { ...item, content: '\0' },
        ],
      ),
    ).toThrow('Binary');
    expect(full).toHaveLength(10);
    expect(() => mergeContextAttachments([], [{ ...item, content: 'x'.repeat(100_001) }])).toThrow(
      '100,000',
    );
  });
  it('keeps streaming projection bounded and ignores deltas/completions for another response', () => {
    const first = nextStreamingMessage(null, { type: 'ResponseStarted', messageId: 'a' });
    expect(
      nextStreamingMessage(first, { type: 'ResponseDelta', messageId: 'b', text: 'wrong' }),
    ).toBe(first);
    const large = nextStreamingMessage(first, {
      type: 'ResponseDelta',
      messageId: 'a',
      text: 'x'.repeat(70_000),
    });
    expect(large?.content).toHaveLength(65_536);
    expect(
      nextStreamingMessage(large, {
        type: 'ResponseCompleted',
        messageId: 'a',
        finishReason: 'Complete',
      })?.partial,
    ).toBe(false);
  });
});
