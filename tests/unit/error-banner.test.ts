import { describe, expect, it } from 'vitest';
import { errorBannerFor } from '../../webview/src/state/errorBanner.js';

describe('errorBannerFor', () => {
  it('routes connection failures to the provider banner', () => {
    expect(
      errorBannerFor({
        type: 'ErrorOccurred',
        code: 'ProviderUnavailable',
        message: 'down',
        recoverable: true,
      }),
    ).toEqual({ kind: 'provider', text: 'down' });
  });

  it('surfaces agent failures as the visible error banner', () => {
    expect(
      errorBannerFor({
        type: 'ErrorOccurred',
        code: 'AgentFailed',
        message: 'boom',
        recoverable: true,
      }),
    ).toEqual({ kind: 'error', text: 'boom' });
    expect(
      errorBannerFor({
        type: 'ErrorOccurred',
        code: 'RuntimeFailed',
        message: 'x',
        recoverable: true,
      }),
    ).toEqual({ kind: 'error', text: 'x' });
  });
});
