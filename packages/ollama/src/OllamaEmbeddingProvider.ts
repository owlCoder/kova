import type { CancellationToken } from '../../core/src/common/CancellationToken.js';
import type { EmbeddingProvider } from '../../core/src/indexing/EmbeddingProvider.js';
import { OllamaConnection } from './OllamaConnection.js';

const BATCH_SIZE = 16;

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly connection: OllamaConnection,
    private readonly modelId: string,
  ) {}

  async embed(
    texts: readonly string[],
    cancellation: CancellationToken,
  ): Promise<readonly (readonly number[])[]> {
    const vectors: (readonly number[])[] = [];
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      cancellation.throwIfCancellationRequested();
      const batch = texts.slice(start, start + BATCH_SIZE);
      const raw = await this.connection.json(
        '/api/embed',
        { model: this.modelId, input: batch },
        cancellation,
      );
      vectors.push(...OllamaEmbeddingProvider.parse(raw, batch.length));
    }
    return vectors;
  }

  private static parse(raw: unknown, expected: number): (readonly number[])[] {
    if (
      !raw ||
      typeof raw !== 'object' ||
      !('embeddings' in raw) ||
      !Array.isArray(raw.embeddings) ||
      raw.embeddings.length !== expected
    )
      throw new Error('Invalid Ollama embedding response.');
    return raw.embeddings.map((vector: unknown) => {
      if (
        !Array.isArray(vector) ||
        vector.length === 0 ||
        !vector.every((value) => typeof value === 'number' && Number.isFinite(value))
      )
        throw new Error('Invalid Ollama embedding vector.');
      return vector as number[];
    });
  }
}
