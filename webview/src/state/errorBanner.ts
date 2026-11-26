import type { PresentationEvent } from '../../../packages/protocol/src/PresentationEvent.js';

/**
 * Maps an error event to the composer banner: connection problems go to the
 * provider banner, everything else (AgentFailed, runtime errors) must be
 * visible immediately as the error banner instead of only a collapsed note.
 */
export function errorBannerFor(
  event: Extract<PresentationEvent, { type: 'ErrorOccurred' }>,
): { readonly kind: 'provider' | 'error'; readonly text: string } | null {
  if (event.code === 'ProviderUnavailable') return { kind: 'provider', text: event.message };
  return { kind: 'error', text: event.message };
}
