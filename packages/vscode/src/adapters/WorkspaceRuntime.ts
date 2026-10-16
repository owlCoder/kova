import { NodeWorkspaceRuntime } from '../../../runtime/src/adapters/NodeWorkspaceRuntime.js';
import { NodeWorkspacePathGuard } from '../../../runtime/src/adapters/NodeWorkspacePathGuard.js';
import type { AgentEventSink } from '../../../core/src/agents/AgentEventSink.js';
import type { ApprovalPort } from '../../../core/src/permissions/ApprovalPort.js';
import type { Guardrail } from '../../../core/src/permissions/Guardrail.js';
import { VsCodeWorkspaceReader } from './VsCodeWorkspaceReader.js';
import { VsCodeWorkspaceWriter } from './VsCodeWorkspaceWriter.js';

export class WorkspaceRuntime extends NodeWorkspaceRuntime {
  constructor(
    root: string,
    approval: ApprovalPort,
    events: AgentEventSink,
    guards: readonly Guardrail[] = [],
  ) {
    const guard = new NodeWorkspacePathGuard(root);
    super(root, approval, events, guards, {
      reader: new VsCodeWorkspaceReader(guard),
      writer: new VsCodeWorkspaceWriter(guard),
    });
  }
}
