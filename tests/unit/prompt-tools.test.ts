import { savePromptIntent } from '../../webview/src/state/savePromptIntent.js';
import { describe, expect, it } from 'vitest';
import { insertComposerText } from '../../webview/src/state/insertComposerText.js';
import { recentPrompts } from '../../webview/src/state/recentPrompts.js';
import { promptTemplates } from '../../webview/src/components/promptTemplates.js';
import { translate } from '../../webview/src/i18n/I18n.js';

describe('composer prompt tools', () => {
  it('inserts at the caret and preserves every character in an existing draft', () => {
    expect(insertComposerText('BeforeAfter', 'New prompt', 6)).toEqual({
      text: 'Before\n\nNew prompt\n\nAfter',
      caret: 20,
    });
    expect(insertComposerText('Existing draft', 'Another prompt')?.text).toBe(
      'Existing draft\n\nAnother prompt',
    );
    expect(insertComposerText('', '  code\n')).toEqual({ text: '  code\n', caret: 7 });
    expect(insertComposerText('before\n', 'next')).toEqual({ text: 'before\nnext', caret: 11 });
  });
  it('refuses over-limit insertion without truncating existing text', () => {
    expect(insertComposerText('x'.repeat(15999), 'y')).toBeNull();
    expect(insertComposerText('', 'x'.repeat(16000))?.text).toHaveLength(16000);
    expect(insertComposerText('Keep this', '  ')).toBeNull();
  });
  it('reuses only user prompts, newest first, deduplicated and bounded', () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({
      id: `${i}`,
      role: 'user' as const,
      content: `Prompt ${i}`,
      partial: false,
    }));
    const results = recentPrompts([
      ...messages,
      { id: 'dup', role: 'user', content: 'Prompt 18', partial: false },
      {
        id: 'assistant',
        role: 'assistant',
        content: 'Never reuse an assistant answer',
        partial: false,
      },
      { id: 'too-long', role: 'user', content: 'x'.repeat(16001), partial: false },
    ]);
    expect(results).toHaveLength(12);
    expect(results.slice(0, 3)).toEqual(['Prompt 18', 'Prompt 19', 'Prompt 17']);
    expect(recentPrompts()).toEqual([]);
  });
  it('provides distinct, fully translated editable templates', () => {
    expect(new Set(promptTemplates.map((item) => item.id)).size).toBe(6);
    for (const template of promptTemplates) {
      for (const language of ['sr', 'de'] as const) {
        expect(translate(language, template.text)).not.toBe(template.text);
        expect(translate(language, template.title)).not.toBe(template.title);
      }
    }
  });
  it('retains an editor opening revision across library broadcasts and preserves a conflicting draft as a new copy', () => {
    const edit = {
      id: 'saved-prompt',
      revision: 'revision-at-open',
      title: 'My draft',
      text: 'Unsaved local edits.\n  <code>\n',
    };
    const latest = {
      version: 1 as const,
      revision: 'new-revision-from-another-view',
      prompts: [{ id: 'saved-prompt', title: 'Other view', text: 'Committed by the other view' }],
    };
    expect(() => savePromptIntent(latest, edit)).toThrow('changed in another view');
    expect(() => savePromptIntent(latest, { ...edit, revision: null })).toThrow(
      'changed in another view',
    );
    expect(savePromptIntent(latest, { ...edit, id: null, revision: null })).toEqual({
      type: 'SavePrompt',
      revision: latest.revision,
      id: null,
      title: edit.title,
      text: edit.text,
    });
    expect(latest.prompts[0]?.text).toBe('Committed by the other view');
    expect(savePromptIntent({ ...latest, revision: edit.revision }, edit).id).toBe(edit.id);
  });
});
