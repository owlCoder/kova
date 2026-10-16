import * as vscode from 'vscode';
import type { AgentEventSink } from '../../../core/src/agents/AgentEventSink.js';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { ApprovalPort } from '../../../core/src/permissions/ApprovalPort.js';
import { NodeProcessRunner } from '../../../runtime/src/adapters/NodeProcessRunner.js';
import { NodeWorkspacePathGuard } from '../../../runtime/src/adapters/NodeWorkspacePathGuard.js';
import { WorkspaceRuntime } from '../adapters/WorkspaceRuntime.js';
import { WorkspaceProjectInstructions } from '../../../runtime/src/adapters/WorkspaceProjectInstructions.js';
import { ErsGuardrailAdapter } from '../../../runtime/src/integrations/ErsGuardrailAdapter.js';
import { WorkspaceSkillRepository } from '../../../runtime/src/skills/WorkspaceSkillRepository.js';

export async function createWorkspaceServices(
  root: string,
  approval: ApprovalPort,
  sink: AgentEventSink,
  cancellation: CancellationToken,
) {
  const project = vscode.workspace
    .getConfiguration('kova')
    .get<string>('ers.guardrailsProject', '');
  const guards = project
    ? [
        new ErsGuardrailAdapter(
          root,
          (await new NodeWorkspacePathGuard(root).resolve(root, project, 'Read', cancellation))
            .canonicalPath,
          new NodeProcessRunner(root),
        ),
      ]
    : [];
  return {
    runtime: new WorkspaceRuntime(root, approval, sink, guards),
    skills: new WorkspaceSkillRepository(root, (message) =>
      sink.emit({
        type: 'ErrorOccurred',
        code: 'InvalidSkill',
        message,
        recoverable: true,
      }),
    ),
    instructions: new WorkspaceProjectInstructions(root, (message) =>
      sink.emit({
        type: 'ErrorOccurred',
        code: 'ProjectRulesSkipped',
        message,
        recoverable: true,
      }),
    ),
  };
}
