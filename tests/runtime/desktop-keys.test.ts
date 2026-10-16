import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const encryption = vi.hoisted(() => ({ available: true }));
vi.mock('electron', () => ({
  safeStorage: {
    isAsyncEncryptionAvailable: async () => encryption.available,
    getSelectedStorageBackend: () => (encryption.available ? 'gnome_libsecret' : 'basic_text'),
    encryptStringAsync: async (text: string) =>
      Buffer.from(`cipher:${Buffer.from(text).toString('base64')}`),
    decryptStringAsync: async (value: Buffer) => ({
      result: Buffer.from(value.toString().slice(7), 'base64').toString(),
      shouldReEncrypt: false,
    }),
  },
}));
import { DesktopKeyStore } from '../../packages/desktop/src/state/DesktopKeyStore.js';
import type { ProviderConfiguration } from '../../packages/runtime/src/providers/ProviderConfiguration.js';

let directory: string;
const provider: ProviderConfiguration = {
  kind: 'openaiCompatible',
  label: 'Example',
  baseUrl: 'https://first.example/v1',
  model: 'model',
  supportsTools: true,
  discoverModels: true,
};
beforeEach(async () => {
  encryption.available = true;
  directory = await mkdtemp(join(tmpdir(), 'kova-keys-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
describe('desktop OS credential storage', () => {
  it('stores ciphertext, scopes keys to endpoints, and restores remembered keys', async () => {
    const keys = new DesktopKeyStore(directory);
    await keys.load();
    expect(await keys.set(provider, 'test-credential', true)).toBe(true);
    expect(await readFile(join(directory, 'credentials.json'), 'utf8')).not.toContain(
      'test-credential',
    );
    const restored = new DesktopKeyStore(directory);
    await restored.load();
    expect(await restored.get(provider)).toBe('test-credential');
    expect(
      await restored.get({ ...provider, baseUrl: 'https://another.example/v1' }),
    ).toBeUndefined();
    await restored.delete(provider);
    expect(await restored.get(provider)).toBeUndefined();
  });
  it('keeps keys only in memory if secure storage is unavailable or persistence is disabled', async () => {
    encryption.available = false;
    const keys = new DesktopKeyStore(directory);
    await keys.load();
    expect(await keys.set(provider, 'session-only', true)).toBe(false);
    expect(await keys.get(provider)).toBe('session-only');
    const reloaded = new DesktopKeyStore(directory);
    await reloaded.load();
    expect(await reloaded.get(provider)).toBeUndefined();
    encryption.available = true;
    expect(await keys.set(provider, 'do-not-remember', false)).toBe(false);
    expect(await readFile(join(directory, 'credentials.json'), 'utf8')).toBe('{}');
  });
});
