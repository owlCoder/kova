import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Conversation } from '../../webview/src/components/Conversation.js';
import type { SessionSnapshot } from '../../packages/protocol/src/SessionSnapshot.js';

const snapshot: SessionSnapshot = {
  conversationId: 'history',
  activeRunId: null,
  state: 'Idle',
  mode: 'Manual',
  selectedModelId: '',
  models: [],
  providerStatus: 'Unavailable',
  providerLabel: 'Local',
  setupCompleted: true,
  configuringProvider: false,
  toolsEnabled: false,
  skills: [],
  activeSkillId: null,
  usage: null,
  messages: Array.from({ length: 1000 }, (_, i) => ({
    id: `${i}`,
    role: i % 2 ? 'assistant' : 'user',
    content: `Message-number-${i}.`,
    partial: false,
  })),
  contextAttachments: [],
  pendingApproval: null,
  thinkingEnabled: false,
  contextMaxTokens: 32768,
};
const render = (searching: boolean) =>
  renderToStaticMarkup(
    createElement(Conversation, {
      snapshot,
      thinking: {},
      activities: [],
      busy: false,
      onReuse: () => {},
      onSavePrompt: () => {},
      scroller: { current: null },
      searching,
      followLatest: true,
    }),
  );
describe('progressive conversation rendering', () => {
  it('renders only the latest 40 Markdown messages on initial open while retaining the full snapshot', () => {
    const output = render(false);
    expect(output.match(/<article /g)).toHaveLength(40);
    expect(output).toContain('Message-number-999.');
    expect(output).not.toContain('Message-number-0.');
    expect(output).toContain('40 of 1000 messages');
    expect(snapshot.messages).toHaveLength(1000);
  });
  it('makes the complete conversation available to find, including older messages', () => {
    const output = render(true);
    expect(output.match(/<article /g)).toHaveLength(1000);
    expect(output).toContain('Message-number-0.');
    expect(output).toContain('Message-number-999.');
    expect(output).toContain('All messages loaded');
  });
});
