import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { safeStorage } from 'electron';
import type { ProviderConfiguration } from '../../../runtime/src/providers/ProviderConfiguration.js';
import { writeJson } from './writeJson.js';

export class DesktopKeyStore {
  private readonly memory = new Map<string, string>();
  private encrypted: Record<string, string> = {};
  constructor(private readonly directory: string) {}
  async load(): Promise<void> {
    try {
      this.encrypted = JSON.parse(
        await readFile(join(this.directory, 'credentials.json'), 'utf8'),
      ) as Record<string, string>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('Stored credentials could not be loaded.');
    }
  }
  async get(config: ProviderConfiguration): Promise<string | undefined> {
    if (config.kind === 'ollama') return undefined;
    const key = this.key(config);
    if (this.memory.has(key)) return this.memory.get(key);
    const encrypted = this.encrypted[key];
    if (!encrypted) return undefined;
    try {
      const result = await safeStorage.decryptStringAsync(Buffer.from(encrypted, 'base64'));
      this.memory.set(key, result.result);
      return result.result;
    } catch {
      throw new Error(
        'Unlock your operating system credential store or replace this provider key.',
      );
    }
  }
  async set(config: ProviderConfiguration, value: string, remember: boolean): Promise<boolean> {
    const key = this.key(config);
    const encrypted = { ...this.encrypted };
    delete encrypted[key];
    const available =
      remember &&
      (await safeStorage.isAsyncEncryptionAvailable()) &&
      !(process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text');
    if (available)
      encrypted[key] = (await safeStorage.encryptStringAsync(value)).toString('base64');
    await writeJson(join(this.directory, 'credentials.json'), encrypted);
    this.encrypted = encrypted;
    this.memory.set(key, value);
    return Boolean(available);
  }
  async delete(config: ProviderConfiguration): Promise<void> {
    const key = this.key(config);
    const encrypted = { ...this.encrypted };
    delete encrypted[key];
    await writeJson(join(this.directory, 'credentials.json'), encrypted);
    this.encrypted = encrypted;
    this.memory.delete(key);
  }
  private key(config: ProviderConfiguration): string {
    return createHash('sha256')
      .update(`${config.kind}|${config.baseUrl.replace(/\/+$/, '')}`)
      .digest('hex');
  }
}
