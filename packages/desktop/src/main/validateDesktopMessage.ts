import type { WebviewMessage } from '../../../protocol/src/WebviewMessage.js';
import { validateMessage } from '../../../runtime/src/presentation/validateMessage.js';

const fields: Record<string, readonly string[]> = {
  OpenWorkspace: [],
  SelectWorkspace: ['path'],
  SelectConversation: ['conversationId'],
  RenameConversation: ['conversationId', 'title'],
  ArchiveConversation: ['conversationId'],
  ListWorkspaceFiles: ['path'],
  SearchWorkspaceFiles: ['query'],
  OpenWorkspaceFile: ['path'],
  WorkspaceDiff: [],
  OpenDataDirectory: [],
  TestProvider: ['draft'],
  SaveProvider: ['draft'],
  SetTheme: ['theme'],
  SetLanguage: ['language'],
  SetTextSize: ['textSize'],
  WindowAction: ['action'],
  OpenTerminal: ['cols', 'rows'],
  TerminalInput: ['terminalId', 'data'],
  ResizeTerminal: ['terminalId', 'cols', 'rows'],
  TerminalAck: ['terminalId', 'characters'],
  CloseTerminal: ['terminalId'],
};

export function validateDesktopMessage(raw: unknown): WebviewMessage {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || JSON.stringify(raw).length > 65_536)
    throw new Error('Invalid desktop request.');
  const value = raw as Record<string, unknown>;
  if (typeof value.type !== 'string' || !(value.type in fields)) return validateMessage(raw);
  const allowed = fields[value.type]!;
  if (
    value.protocolVersion !== 1 ||
    typeof value.requestId !== 'string' ||
    value.requestId.length > 100 ||
    Object.keys(value).some(
      (key) => !['type', 'protocolVersion', 'requestId', ...allowed].includes(key),
    ) ||
    allowed.some((key) => !(key in value))
  )
    throw new Error('Invalid request fields.');
  if ('language' in value && !['en', 'sr', 'de'].includes(String(value.language)))
    throw new Error('Invalid language.');
  if ('textSize' in value && !['standard', 'large', 'larger'].includes(String(value.textSize)))
    throw new Error('Invalid text size.');
  if ('action' in value && !['sync', 'maximize'].includes(String(value.action)))
    throw new Error('Invalid window action.');
  if (
    'terminalId' in value &&
    (typeof value.terminalId !== 'string' || !/^[a-f0-9-]{36}$/.test(value.terminalId))
  )
    throw new Error('Invalid terminal ID.');
  if ('data' in value && (typeof value.data !== 'string' || value.data.length > 16_384))
    throw new Error('Terminal input exceeds the limit.');
  for (const key of ['cols', 'rows', 'characters'])
    if (
      key in value &&
      (typeof value[key] !== 'number' ||
        !Number.isInteger(value[key]) ||
        (value[key] as number) < 1 ||
        (value[key] as number) > (key === 'characters' ? 65_536 : key === 'cols' ? 500 : 200))
    )
      throw new Error('Invalid terminal dimensions or acknowledgment.');
  if (
    'query' in value &&
    (typeof value.query !== 'string' || !value.query.trim() || value.query.length > 128)
  )
    throw new Error('Enter a file search up to 128 characters.');
  if ('path' in value && (typeof value.path !== 'string' || value.path.length > 4096))
    throw new Error('Invalid path.');
  if (
    'conversationId' in value &&
    (typeof value.conversationId !== 'string' || !/^[a-f0-9-]{36}$/.test(value.conversationId))
  )
    throw new Error('Invalid session ID.');
  if (
    'title' in value &&
    (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200)
  )
    throw new Error('Invalid session title.');
  if ('theme' in value && !['dark', 'light', 'system'].includes(value.theme as string))
    throw new Error('Invalid theme.');
  if ('draft' in value) {
    const draft = value.draft as Record<string, unknown> | null;
    const draftKeys = [
      'kind',
      'label',
      'baseUrl',
      'model',
      'supportsTools',
      'discoverModels',
      'thinking',
      'apiKey',
      'keyAction',
      'rememberKey',
    ];
    if (
      !draft ||
      typeof draft !== 'object' ||
      Array.isArray(draft) ||
      Object.keys(draft).some((key) => !draftKeys.includes(key)) ||
      draftKeys.some((key) => !(key in draft))
    )
      throw new Error('Invalid provider settings.');
    if (
      !['ollama', 'deepseek', 'openaiCompatible'].includes(draft.kind as string) ||
      !['keep', 'replace', 'remove'].includes(draft.keyAction as string) ||
      ['supportsTools', 'discoverModels', 'thinking', 'rememberKey'].some(
        (key) => typeof draft[key] !== 'boolean',
      ) ||
      typeof draft.label !== 'string' ||
      !draft.label.trim() ||
      draft.label.length > 100 ||
      typeof draft.baseUrl !== 'string' ||
      draft.baseUrl.length > 2048 ||
      typeof draft.model !== 'string' ||
      draft.model.length > 256 ||
      (!draft.discoverModels && !draft.model.trim()) ||
      typeof draft.apiKey !== 'string' ||
      draft.apiKey.length > 8192 ||
      (draft.keyAction === 'replace' && !draft.apiKey.trim())
    )
      throw new Error('Invalid provider settings.');
    let url: URL;
    try {
      url = new URL(draft.baseUrl);
    } catch {
      throw new Error('Enter a valid provider endpoint.');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('Use an HTTP(S) endpoint without embedded credentials or query parameters.');
    if (draft.kind === 'openaiCompatible' && draft.thinking)
      throw new Error('Thinking is not standardized for compatible endpoints.');
  }
  return value as WebviewMessage;
}
