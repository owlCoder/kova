import { describe, expect, it } from 'vitest';
import type { ModelInfo } from '../../packages/protocol/src/ModelInfo.js';
import { modelChoices } from '../../webview/src/components/modelChoices.js';

const model = (id: string, displayName = id): ModelInfo => ({
  id,
  displayName,
  tools: 'Supported',
  thinking: 'Unknown',
  sizeBytes: null,
  maxContextTokens: 32768,
});
describe('model chooser catalog', () => {
  it('searches model IDs and display names without case/whitespace sensitivity', () => {
    const catalog = [model('provider/code-7b', 'Code assistant'), model('provider/chat', 'Chat')];
    expect(modelChoices(catalog, catalog[0]!.id, '  CODE  ').items).toEqual([catalog[0]]);
    expect(modelChoices(catalog, '', 'PROVIDER/CHAT').items).toEqual([catalog[1]]);
    expect(modelChoices(catalog, 'provider/chat', 'absent').items).toEqual([]);
  });
  it('preserves discovery metadata, deduplicates results and retains a manual model conservatively', () => {
    const item = model('known');
    expect(modelChoices([item, item], 'known', '').items).toEqual([item]);
    expect(modelChoices([item], 'custom:model', 'custom').items).toEqual([
      {
        ...item,
        id: 'custom:model',
        displayName: 'custom:model',
        tools: 'Unknown',
        maxContextTokens: null,
      },
    ]);
    expect(modelChoices(undefined, '', '').items).toEqual([]);
  });
  it('bounds large catalogs and still finds a result beyond the first displayed page', () => {
    const catalog = Array.from({ length: 1000 }, (_, i) => model(`model-${i}`));
    expect(modelChoices(catalog, '', '').items).toHaveLength(80);
    expect(modelChoices(catalog, '', '').more).toBe(true);
    expect(modelChoices(catalog, '', 'model-999')).toEqual({ items: [catalog[999]], more: false });
  });
});
