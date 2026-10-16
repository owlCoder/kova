import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';

/** Bounded reads keep file growth between stat/read from allocating unlimited memory. */
export class BoundedTextFile {
  async read(
    path: string,
    cancellation: CancellationToken,
    maxBytes = 2 * 1024 * 1024,
  ): Promise<{ content: string; hash: string }> {
    cancellation.throwIfCancellationRequested();
    const file = await open(path, 'r');
    try {
      const information = await file.stat();
      if (!information.isFile() || information.size > maxBytes)
        throw new Error(
          'File exceeds the 2 MiB text read limit or is not a regular file; use a smaller file',
        );
      const buffer = Buffer.alloc(Math.min(maxBytes + 1, information.size + 1));
      let length = 0;
      while (length < buffer.length) {
        cancellation.throwIfCancellationRequested();
        const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      if (length > information.size || length > maxBytes)
        throw new Error('File grew while being read; retry with a stable smaller file');
      cancellation.throwIfCancellationRequested();
      const bytes = buffer.subarray(0, length);
      if (bytes.includes(0)) throw new Error('Binary files are not supported by text tools');
      return {
        content: bytes.toString('utf8'),
        hash: createHash('sha256').update(bytes).digest('hex'),
      };
    } finally {
      await file.close();
    }
  }
}
