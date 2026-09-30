import type { CancellationToken } from '../common/CancellationToken.js';

export interface ProcessRunner {
  /** Implementations bound output and terminate the process tree on cancellation/timeout. */
  run(
    request: {
      readonly workspaceId: string;
      readonly command: string;
      readonly timeoutMs: number;
      readonly maxOutputCharacters: number;
    },
    cancellation: CancellationToken,
  ): Promise<{
    readonly exitCode: number | null;
    readonly stdout: string;
    readonly stderr: string;
    readonly omittedCharacters: number;
    readonly cancelled: boolean;
  }>;
}
