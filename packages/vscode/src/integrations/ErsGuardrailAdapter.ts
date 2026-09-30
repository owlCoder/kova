import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { Guardrail } from '../../../core/src/permissions/Guardrail.js';
import type { PermissionRequest } from '../../../core/src/permissions/PermissionRequest.js';
import type { PolicyDecision } from '../../../core/src/permissions/PolicyDecision.js';
import type { ProcessRunner } from '../../../core/src/processes/ProcessRunner.js';

/** Adapter to the actual ERS stdin/exit-code guardrail executable, a separate final guard stage. */
export class ErsGuardrailAdapter implements Guardrail {
  readonly id = 'ers-guardrails';
  constructor(
    private readonly root: string,
    private readonly projectPath: string,
    private readonly runner: ProcessRunner,
  ) {}
  async evaluate(
    request: PermissionRequest,
    cancellation: CancellationToken,
  ): Promise<PolicyDecision> {
    const result = await this.runner.run(
      {
        workspaceId: this.root,
        command: 'dotnet',
        args: ['run', '--project', this.projectPath, '--configuration', 'Release', '--no-build'],
        stdin: JSON.stringify({
          tool_name: request.prepared.call.name,
          tool_input: {
            command: request.prepared.command?.originalCommand ?? null,
            file_path: request.prepared.paths[0]?.path.relativePath ?? null,
          },
        }),
        timeoutMs: 10_000,
        maxOutputCharacters: 2000,
      },
      cancellation,
    );
    if (result.exitCode === 0 && !result.cancelled) return { action: 'Allow', reasons: [] };
    return {
      action: 'Block',
      reasons: [
        `ERS guardrail: ${result.stderr.trim().slice(0, 500) || 'evaluation failed or timed out'}`,
      ],
    };
  }
}
