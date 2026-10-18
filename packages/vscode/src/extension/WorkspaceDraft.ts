import type { Memento } from 'vscode';

export class WorkspaceDraft {
  private value: string;
  constructor(private readonly state: Memento | undefined) {
    const saved = state?.get<unknown>('kova.composerDraft', '');
    this.value = typeof saved === 'string' ? saved.slice(0, 16_000) : '';
  }
  get text(): string {
    return this.value;
  }
  async set(text: string): Promise<void> {
    this.value = text.slice(0, 16_000);
    await this.state?.update('kova.composerDraft', this.value);
  }
  async consume(submitted: string): Promise<void> {
    if (this.value === submitted) await this.set('');
  }
}
