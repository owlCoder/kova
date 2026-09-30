import type { ChatMessage } from '../providers/ChatMessage.js';
import type { ProviderUsage } from '../providers/ChatEvent.js';

/** Conservative estimate corrected upward with measured provider usage. */
export class TokenCounter {
  private correction = 1;
  estimate(text: string): number {
    let bytes = 0;
    for (const character of text) {
      const point = character.codePointAt(0) ?? 0;
      bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
    }
    return Math.ceil(Math.max(text.length / 3, bytes / 3) * this.correction);
  }
  messages(messages: readonly ChatMessage[]): number {
    return messages.reduce((sum, message) => sum + 8 + this.estimate(JSON.stringify(message)), 3);
  }
  reconcile(estimatedInputTokens: number, usage: ProviderUsage): void {
    if (estimatedInputTokens > 0 && usage.inputTokens > estimatedInputTokens)
      this.correction = Math.min(
        8,
        this.correction * (usage.inputTokens / estimatedInputTokens) * 1.05,
      );
  }
}
