/**
 * Slash commands shown when the composer draft starts with '/'. Labels and
 * hints are i18n keys rendered through t(); actions either send a protocol
 * message or open an existing chat surface.
 */
export type SlashAction =
  | { readonly type: 'message'; readonly message: 'NewConversation' | 'CompactConversation' }
  | { readonly type: 'export'; readonly action: 'save' | 'copy' }
  | { readonly type: 'submit'; readonly prompt: string }
  | {
      readonly type: 'open';
      readonly target: 'settings' | 'library' | 'palette' | 'model' | 'mode' | 'context';
    };

/** Model-facing prompt for /init; kept in English because it goes to the model. */
export const initPrompt =
  'Inspect this workspace with list_directory, search_files and read_file (package.json, README, src layout, test setup). Then create or update AGENTS.md at the workspace root: project structure, build/test/lint commands, code conventions, and anything a coding agent must know. Write it with write_file or apply_patch, keep it under 16,000 bytes, and summarize what you wrote.';

export interface SlashCommand {
  readonly id: string;
  readonly command: string;
  readonly hintKey: string;
  readonly action: SlashAction;
}

export const slashCommands: readonly SlashCommand[] = [
  {
    id: 'clear',
    command: '/clear',
    hintKey: 'Start a new conversation',
    action: { type: 'message', message: 'NewConversation' },
  },
  {
    id: 'compact',
    command: '/compact',
    hintKey: 'Summarize older messages and free context',
    action: { type: 'message', message: 'CompactConversation' },
  },
  {
    id: 'export',
    command: '/export',
    hintKey: 'Save the conversation as Markdown',
    action: { type: 'export', action: 'save' },
  },
  {
    id: 'copy',
    command: '/copy',
    hintKey: 'Copy the conversation as Markdown',
    action: { type: 'export', action: 'copy' },
  },
  {
    id: 'model',
    command: '/model',
    hintKey: 'Choose a model',
    action: { type: 'open', target: 'model' },
  },
  {
    id: 'mode',
    command: '/mode',
    hintKey: 'Switch the permission mode',
    action: { type: 'open', target: 'mode' },
  },
  {
    id: 'context',
    command: '/context',
    hintKey: 'Show context usage',
    action: { type: 'open', target: 'context' },
  },
  {
    id: 'prompts',
    command: '/prompts',
    hintKey: 'Open the prompt library',
    action: { type: 'open', target: 'library' },
  },
  {
    id: 'settings',
    command: '/settings',
    hintKey: 'Open the Kova settings dialog',
    action: { type: 'open', target: 'settings' },
  },
  {
    id: 'init',
    command: '/init',
    hintKey: 'Analyze the workspace and write AGENTS.md',
    action: { type: 'submit', prompt: initPrompt },
  },
  {
    id: 'help',
    command: '/help',
    hintKey: 'Show all commands',
    action: { type: 'open', target: 'palette' },
  },
];

/**
 * Commands matching a '/…' draft. An empty query lists everything; an exact
 * match is moved to the top so Enter runs it immediately.
 */
export function matchSlashCommands(draft: string): readonly SlashCommand[] {
  if (!draft.startsWith('/')) return [];
  const name = draft.slice(1).split(/\s/, 1)[0]?.toLowerCase() ?? '';
  const matches = slashCommands.filter((command) => command.command.slice(1).startsWith(name));
  return [...matches].sort(
    (a, b) => Number(b.command.slice(1) === name) - Number(a.command.slice(1) === name),
  );
}
