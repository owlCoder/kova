import type { ModelInfo } from '../../../packages/protocol/src/ModelInfo.js';

/** Bound rendered results while retaining a manually configured model absent from discovery. */
export function modelChoices(
  models: readonly ModelInfo[] | undefined,
  current: string,
  query: string,
  limit = 80,
) {
  const catalog = models ?? [];
  const fallback: ModelInfo = {
    id: current,
    displayName: current,
    tools: 'Unknown',
    thinking: 'Unknown',
    sizeBytes: null,
    maxContextTokens: null,
  };
  const options =
    current && !catalog.some((item) => item.id === current) ? [fallback, ...catalog] : catalog;
  const search = query.trim().toLocaleLowerCase();
  const matches: ModelInfo[] = [];
  const seen = new Set<string>();
  for (const item of options) {
    if (seen.has(item.id) || !`${item.displayName} ${item.id}`.toLocaleLowerCase().includes(search))
      continue;
    seen.add(item.id);
    matches.push(item);
    if (matches.length > limit) break;
  }
  return { items: matches.slice(0, limit), more: matches.length > limit };
}
