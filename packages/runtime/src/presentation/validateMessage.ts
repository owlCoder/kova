import type { WebviewMessage } from '../../../protocol/src/WebviewMessage.js';

export function validateMessage(raw: unknown): WebviewMessage {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || JSON.stringify(raw).length > 65_536)
    throw new Error('Invalid or oversized message.');
  const value = raw as Record<string, unknown>;
  if (
    value.protocolVersion !== 1 ||
    typeof value.requestId !== 'string' ||
    value.requestId.length > 100 ||
    typeof value.type !== 'string'
  )
    throw new Error('Unsupported protocol or invalid request ID.');
  const fields: Record<string, readonly string[]> = {
    Ready: [],
    GetPromptLibrary: [],
    SavePrompt: ['revision', 'id', 'title', 'text'],
    DeletePrompt: ['revision', 'id'],
    SubmitPrompt: ['prompt', 'modelId', 'mode', 'skillId', 'attachmentIds'],
    CancelRun: ['runId'],
    RevertRun: ['runId'],
    NewConversation: [],
    CompactConversation: [],
    OpenConversation: ['conversationId'],
    RenameConversation: ['conversationId', 'title'],
    ImportConversation: ['markdown'],
    UpdateDraft: ['conversationId', 'prompt'],
    ExportConversation: ['conversationId', 'action'],
    SelectSkill: ['skillId'],
    AddContext: ['source'],
    AttachPath: ['path'],
    AttachImage: ['name', 'mimeType', 'dataUrl'],
    ListWorkspaceFiles: ['query'],
    SetWorkspaceRoot: ['path'],
    RemoveContext: ['attachmentId'],
    PreviewContext: ['conversationId', 'attachmentId'],
    ResolveApproval: ['runId', 'approvalId', 'preparationKey', 'decision'],
    OpenDiffPreview: ['approvalId'],
    RetryProvider: [],
    GetSettings: [],
    UpdateSettings: ['values'],
    OpenSettings: [],
    OpenProviderSetup: [],
    CompleteSetup: [],
    OpenExternal: ['url'],
    CopyText: ['text'],
    OpenSetupInstructions: [],
  };
  const allowed = fields[value.type];
  if (
    !allowed ||
    Object.keys(value).some(
      (key) => !['protocolVersion', 'requestId', 'type', ...allowed].includes(key),
    ) ||
    allowed.some((key) => !(key in value))
  )
    throw new Error('Unknown message type or fields.');
  if (
    ['SavePrompt', 'DeletePrompt'].includes(value.type) &&
    (typeof value.revision !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(value.revision) ||
      (value.id !== null && (typeof value.id !== 'string' || !/^[a-f0-9-]{36}$/.test(value.id))) ||
      (value.type === 'DeletePrompt' && value.id === null))
  )
    throw new Error('Invalid saved prompt reference.');
  if (
    value.type === 'SavePrompt' &&
    (typeof value.title !== 'string' ||
      !value.title.trim() ||
      value.title.length > 80 ||
      typeof value.text !== 'string' ||
      !value.text.trim() ||
      value.text.length > 16_000 ||
      value.title.includes('\0') ||
      value.text.includes('\0'))
  )
    throw new Error('Enter a title up to 80 characters and a prompt up to 16,000 characters.');
  for (const key of ['runId', 'approvalId', 'preparationKey', 'attachmentId', 'modelId'])
    if (key in value && (typeof value[key] !== 'string' || (value[key] as string).length > 256))
      throw new Error(`Invalid ${key}.`);
  if (
    'skillId' in value &&
    value.skillId !== null &&
    (typeof value.skillId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value.skillId))
  )
    throw new Error('Invalid skill ID.');
  if (
    'conversationId' in value &&
    (typeof value.conversationId !== 'string' || !/^[a-f0-9-]{36}$/.test(value.conversationId))
  )
    throw new Error('Invalid conversation ID.');
  if (
    (value.type === 'OpenConversation' || value.type === 'RenameConversation') &&
    !/^[a-f0-9-]{36}$/.test(value.conversationId as string)
  )
    throw new Error('Invalid conversation ID.');
  if (
    value.type === 'ImportConversation' &&
    (typeof value.markdown !== 'string' ||
      !value.markdown.trim() ||
      value.markdown.length > 1_000_000)
  )
    throw new Error('Markdown import must be 1-1,000,000 characters.');
  if (
    value.type === 'RenameConversation' &&
    (typeof value.title !== 'string' ||
      !value.title.trim() ||
      value.title.length > 80 ||
      value.title.includes('\0'))
  )
    throw new Error('Title must be 1-80 characters.');
  if (
    value.type === 'UpdateDraft' &&
    (typeof value.prompt !== 'string' || value.prompt.length > 16_000)
  )
    throw new Error('Draft exceeds the 16,000 character limit.');
  if (value.type === 'ExportConversation' && !['save', 'copy'].includes(value.action as string))
    throw new Error('Invalid export action.');
  if (
    value.type === 'SubmitPrompt' &&
    (typeof value.prompt !== 'string' ||
      !value.prompt.trim() ||
      value.prompt.length > 16_000 ||
      !['Plan', 'Manual', 'Edit', 'Auto'].includes(value.mode as string) ||
      !Array.isArray(value.attachmentIds) ||
      value.attachmentIds.length > 10 ||
      value.attachmentIds.some((id) => typeof id !== 'string'))
  )
    throw new Error('Invalid prompt, mode or context references.');
  if (
    value.type === 'AddContext' &&
    !['Selection', 'CurrentFile', 'PickFiles'].includes(value.source as string)
  )
    throw new Error('Invalid context source.');
  if (
    value.type === 'AttachPath' &&
    (typeof value.path !== 'string' ||
      !value.path.trim() ||
      value.path.length > 512 ||
      value.path.includes('\0'))
  )
    throw new Error('Invalid file path.');
  if (
    value.type === 'AttachImage' &&
    (typeof value.name !== 'string' ||
      !value.name.trim() ||
      value.name.length > 120 ||
      typeof value.mimeType !== 'string' ||
      !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(value.mimeType) ||
      typeof value.dataUrl !== 'string' ||
      value.dataUrl.length > 8_000_000 ||
      !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value.dataUrl))
  )
    throw new Error('Invalid image attachment.');
  if (
    value.type === 'ListWorkspaceFiles' &&
    (typeof value.query !== 'string' || value.query.length > 100 || value.query.includes('\0'))
  )
    throw new Error('Invalid file query.');
  if (
    value.type === 'SetWorkspaceRoot' &&
    (typeof value.path !== 'string' ||
      !value.path.trim() ||
      value.path.length > 512 ||
      value.path.includes('\0'))
  )
    throw new Error('Invalid workspace folder.');
  if (
    value.type === 'ResolveApproval' &&
    !['AllowOnce', 'Reject'].includes(value.decision as string)
  )
    throw new Error('Invalid approval decision.');
  if (
    value.type === 'OpenExternal' &&
    (typeof value.url !== 'string' || value.url.length > 2048 || !/^https?:\/\//i.test(value.url))
  )
    throw new Error('Only HTTP(S) links can be opened.');
  if (value.type === 'CopyText' && (typeof value.text !== 'string' || value.text.length > 60_000))
    throw new Error('Text exceeds the clipboard limit. Select and copy a smaller section.');
  if (value.type === 'UpdateSettings') {
    const values = value.values;
    const validValue = (entry: unknown): boolean =>
      typeof entry === 'string' ||
      typeof entry === 'number' ||
      typeof entry === 'boolean' ||
      (Array.isArray(entry) &&
        entry.length <= 50 &&
        entry.every((item) => typeof item === 'string' && item.length <= 200));
    if (
      !values ||
      typeof values !== 'object' ||
      Array.isArray(values) ||
      Object.keys(values).length > 32 ||
      Object.entries(values).some(
        ([key, entry]) =>
          !/^[a-z][a-z0-9]*(\.[a-z][a-zA-Z0-9]*){1,3}$/.test(key) || !validValue(entry),
      )
    )
      throw new Error('Invalid settings payload.');
  }
  return value as WebviewMessage;
}
