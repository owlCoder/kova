import { CancellationSource } from '../../../core/src/common/CancellationSource.js';
import type { HostMessage } from '../../../protocol/src/HostMessage.js';
import type { WebviewMessage } from '../../../protocol/src/WebviewMessage.js';
import { NodeWorkspaceFileFinder } from '../../../runtime/src/adapters/NodeWorkspaceFileFinder.js';
import type { ContextAttachmentManager } from './ContextAttachmentManager.js';

export type WorkspaceContextMessage = Extract<
  WebviewMessage,
  { readonly type: 'AttachPath' | 'ListWorkspaceFiles' }
> & { readonly requestId: string };

export interface WorkspaceContextHost {
  readonly root: () => string | null;
  readonly runActive: () => boolean;
  readonly attachments: ContextAttachmentManager;
  readonly deliver: (message: HostMessage) => void;
  readonly envelope: () => {
    readonly protocolVersion: 1;
    readonly hostSessionId: string;
    readonly sequence: number;
    readonly workspaceId: string | null;
  };
  readonly snapshot: (requestId: string) => Promise<void>;
}

/** Handles @mention file search and attach; returns true when the message was one. */
export async function handleWorkspaceContextMessage(
  host: WorkspaceContextHost,
  message: WorkspaceContextMessage,
): Promise<void> {
  if (message.type === 'AttachPath') {
    if (host.runActive()) throw new Error('Cannot change context during a run.');
    await host.attachments.addPath(message.path);
    await host.snapshot(message.requestId);
    return;
  }
  const root = host.root();
  if (!root) throw new Error('Open a workspace to search files.');
  const source = new CancellationSource();
  const found = await new NodeWorkspaceFileFinder(root).find(message.query, source);
  host.deliver({
    ...host.envelope(),
    type: 'WorkspaceFiles',
    requestId: message.requestId,
    files: found.entries.map((entry) => entry.path),
    truncated: found.truncated,
  });
}
