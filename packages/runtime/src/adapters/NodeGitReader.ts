import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { ProcessRunner } from '../../../core/src/processes/ProcessRunner.js';
import type { GitReader } from '../../../core/src/workspace/GitReader.js';
import { NodeWorkspacePathGuard } from './NodeWorkspacePathGuard.js';

export class NodeGitReader implements GitReader {
  constructor(
    private readonly runner: ProcessRunner,
    private readonly guard: NodeWorkspacePathGuard,
  ) {}
  async diff(
    workspaceId: string,
    staged: boolean,
    relativePath: string | null,
    cancellation: CancellationToken,
  ): Promise<string> {
    const path = relativePath
      ? await this.guard.resolve(workspaceId, relativePath, 'Read', cancellation)
      : null;
    const result = await this.runner.run(
      {
        workspaceId,
        command: 'git',
        args: [
          '-c',
          'core.fsmonitor=false',
          'diff',
          '--no-ext-diff',
          '--no-textconv',
          ...(staged ? ['--cached'] : []),
          '--',
          ...(path ? [path.relativePath] : []),
        ],
        timeoutMs: 30000,
        maxOutputCharacters: 30000,
      },
      cancellation,
    );
    if (result.cancelled) throw new Error('Cancelled');
    if (result.exitCode !== 0)
      throw new Error(result.timedOut ? 'Git diff timed out' : result.stderr || 'Git diff failed');
    return (
      result.stdout +
      (result.omittedCharacters
        ? `\n[output truncated: omitted ${result.omittedCharacters} characters]`
        : '')
    );
  }
}
