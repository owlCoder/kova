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
    SubmitPrompt: ['prompt', 'modelId', 'mode', 'skillId', 'attachmentIds'],
    CancelRun: ['runId'],
    NewConversation: [],
    SelectSkill: ['skillId'],
    AddContext: ['source'],
    RemoveContext: ['attachmentId'],
    ResolveApproval: ['runId', 'approvalId', 'preparationKey', 'decision'],
    OpenDiffPreview: ['approvalId'],
    RetryProvider: [],
    OpenSettings: [],
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
    value.type === 'ResolveApproval' &&
    !['AllowOnce', 'Reject'].includes(value.decision as string)
  )
    throw new Error('Invalid approval decision.');
  return value as WebviewMessage;
}
