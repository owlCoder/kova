import type { SessionSnapshot } from '../../../protocol/src/SessionSnapshot.js';

/** Export only the visible user/assistant transcript, excluding tool payloads and reasoning. */
export function conversationMarkdown(
  messages: SessionSnapshot['messages'],
  metadata: { readonly provider: string; readonly model: string },
): string {
  const visible = messages.filter((message) => message.content.trim());
  if (!visible.length) throw new Error('There are no messages to export yet.');
  const line = (text: string) => text.replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, 256);
  const header = `# Kova conversation\n\nProvider at export: ${line(metadata.provider)}\nSelected model: ${line(metadata.model)}\n\n`;
  return (
    header +
    visible
      .map(
        (message) =>
          `## ${message.role === 'user' ? 'You' : 'Kova'}${message.partial ? ' · Partial response' : ''}\n\n${message.content}\n`,
      )
      .join('\n---\n\n')
  );
}
