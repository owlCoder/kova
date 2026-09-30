import type { CancellationToken } from '../common/CancellationToken.js';

export interface ProcessRunner {
  /** args means direct executable invocation; omitted args means a checked shell command. */
  run(
    request: {
      readonly workspaceId: string;
      readonly command: string;
      readonly args?: readonly string[];
      readonly stdin?: string;
      readonly workingDirectory?: string;
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
    readonly timedOut: boolean;
  }>;
}
