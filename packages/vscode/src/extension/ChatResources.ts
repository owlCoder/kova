import type { ExtensionContext } from 'vscode';
import type { ContextAttachment } from '../../../core/src/context/ContextAttachment.js';
import type { HostMessage } from '../../../protocol/src/HostMessage.js';
import type { WebviewMessage } from '../../../protocol/src/WebviewMessage.js';
import { PromptLibraryService } from '../../../runtime/src/presentation/PromptLibraryService.js';
import { previewContext } from '../../../runtime/src/presentation/previewContext.js';
import { KovaSettings } from './kovaSettings.js';
import { WorkspaceDraft } from './WorkspaceDraft.js';

type ResourcePayload = HostMessage extends infer M
  ? M extends Extract<
      HostMessage,
      { type: 'PromptLibrary' | 'ContextPreview' | 'Settings' | 'Notice' | 'OpenSettings' }
    >
    ? Omit<M, 'protocolVersion' | 'hostSessionId' | 'sequence' | 'workspaceId'>
    : never
  : never;
const actions = new Set([
  'GetPromptLibrary',
  'SavePrompt',
  'DeletePrompt',
  'PreviewContext',
  'UpdateDraft',
  'GetSettings',
  'UpdateSettings',
  'OpenSettings',
]);

/** Explicit UI resources stay outside model snapshots and generation preparation. */
export class ChatResources {
  readonly draft: WorkspaceDraft;
  private readonly library: PromptLibraryService;
  private readonly settings: KovaSettings;
  constructor(
    context: ExtensionContext,
    private readonly current: () => {
      conversationId: string;
      attachments: readonly ContextAttachment[];
    },
    private readonly deliver: (payload: ResourcePayload) => void,
  ) {
    this.draft = new WorkspaceDraft(context.workspaceState);
    this.settings = new KovaSettings();
    this.library = new PromptLibraryService({
      read: async () => context.workspaceState?.get<unknown>('kova.promptLibrary'),
      write: async (library) => {
        if (!context.workspaceState) throw new Error('Local prompt storage is unavailable.');
        await context.workspaceState.update('kova.promptLibrary', library);
      },
    });
  }
  handles(type: WebviewMessage['type']): boolean {
    return actions.has(type);
  }
  async handle(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case 'GetPromptLibrary':
      case 'SavePrompt':
      case 'DeletePrompt':
        this.deliver({
          type: 'PromptLibrary',
          requestId: message.requestId,
          library: await this.library.handle(message),
        });
        return;
      case 'PreviewContext': {
        const current = this.current();
        this.deliver({
          type: 'ContextPreview',
          requestId: message.requestId,
          preview: previewContext(current.conversationId, current.attachments, message),
        });
        return;
      }
      case 'UpdateDraft':
        if (message.conversationId === this.current().conversationId)
          await this.draft.set(message.prompt);
        return;
      case 'GetSettings':
        this.deliver({
          type: 'Settings',
          requestId: message.requestId,
          settings: this.settings.read(),
        });
        return;
      case 'UpdateSettings':
        await this.settings.apply(message.values);
        this.deliver({
          type: 'Settings',
          requestId: message.requestId,
          settings: this.settings.read(),
        });
        this.deliver({ type: 'Notice', message: 'Settings saved.' });
        return;
      case 'OpenSettings':
        // The launcher's settings action: the chat opens its own settings dialog.
        this.deliver({ type: 'OpenSettings' });
        return;
    }
  }
  async flush(): Promise<void> {
    await this.library.flush();
  }
}
