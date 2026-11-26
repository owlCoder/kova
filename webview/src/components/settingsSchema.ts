/**
 * Fields of the Kova settings dialog. Keys are configuration paths without
 * the `kova.` prefix; the host validates them against its own allowlist.
 * Every label and hint is an i18n key rendered through t().
 */
export type SettingField =
  | {
      readonly key: string;
      readonly kind: 'select';
      readonly labelKey: string;
      readonly hintKey: string;
      readonly options: ReadonlyArray<{ readonly value: string; readonly labelKey: string }>;
    }
  | {
      readonly key: string;
      readonly kind: 'number';
      readonly labelKey: string;
      readonly hintKey: string;
      readonly min: number;
      readonly max: number;
    }
  | {
      readonly key: string;
      readonly kind: 'text';
      readonly labelKey: string;
      readonly hintKey: string;
    }
  | {
      readonly key: string;
      readonly kind: 'checkbox';
      readonly labelKey: string;
      readonly hintKey: string;
    }
  | {
      readonly key: string;
      readonly kind: 'commandList';
      readonly labelKey: string;
      readonly hintKey: string;
    };

export interface SettingSection {
  readonly titleKey: string;
  readonly fields: readonly SettingField[];
}

export const settingsSections: readonly SettingSection[] = [
  {
    titleKey: 'Appearance & language',
    fields: [
      {
        key: 'ui.language',
        kind: 'select',
        labelKey: 'Language',
        hintKey:
          'Applies immediately to the interface. Your code and conversations stay as written.',
        options: [
          { value: 'en', labelKey: 'English' },
          { value: 'sr', labelKey: 'Serbian Latin' },
          { value: 'de', labelKey: 'German' },
        ],
      },
      {
        key: 'ui.textSize',
        kind: 'select',
        labelKey: 'Text size',
        hintKey: 'Larger text across the whole Kova interface.',
        options: [
          { value: 'standard', labelKey: 'Standard' },
          { value: 'large', labelKey: 'Large' },
          { value: 'larger', labelKey: 'Larger' },
        ],
      },
    ],
  },
  {
    titleKey: 'Chat',
    fields: [
      {
        key: 'chat.openIn',
        kind: 'select',
        labelKey: 'Where Kova opens',
        hintKey: 'Chat opens here until you change it.',
        options: [
          { value: 'editor', labelKey: 'Editor tab' },
          { value: 'sidebar', labelKey: 'Activity Bar sidebar' },
        ],
      },
    ],
  },
  {
    titleKey: 'Context budget',
    fields: [
      {
        key: 'context.maxTokens',
        kind: 'number',
        labelKey: 'Context budget (tokens)',
        hintKey: "Capped to the selected model's window.",
        min: 1024,
        max: 2_000_000,
      },
      {
        key: 'context.reservedOutputTokens',
        kind: 'number',
        labelKey: 'Reserved output tokens',
        hintKey: 'Kept for the answer; never more than a quarter of the window.',
        min: 256,
        max: 65_536,
      },
      {
        key: 'ollama.maxContextTokens',
        kind: 'number',
        labelKey: 'Ollama context limit (tokens)',
        hintKey: 'Local Ollama reserves memory for the whole window, so it keeps a lower cap.',
        min: 1024,
        max: 1_000_000,
      },
    ],
  },
  {
    titleKey: 'Ollama',
    fields: [
      {
        key: 'ollama.baseUrl',
        kind: 'text',
        labelKey: 'Ollama base URL',
        hintKey: 'Endpoint of the local Ollama runtime.',
      },
      {
        key: 'ollama.model',
        kind: 'text',
        labelKey: 'Default Ollama model',
        hintKey: 'Model used for new conversations.',
      },
      {
        key: 'ollama.think',
        kind: 'checkbox',
        labelKey: 'Stream model thinking',
        hintKey: 'Show model reasoning separately; it is never saved in conversations.',
      },
      {
        key: 'ollama.keepAliveSeconds',
        kind: 'number',
        labelKey: 'Keep model alive (seconds)',
        hintKey: 'How long Ollama keeps the model in memory after a reply.',
        min: 0,
        max: 86_400,
      },
    ],
  },
  {
    titleKey: 'Auto mode commands',
    fields: [
      {
        key: 'commands.allow',
        kind: 'commandList',
        labelKey: 'Allowlisted commands',
        hintKey:
          'One command per line, for example: git status. Auto mode runs these without asking.',
      },
    ],
  },
];

/** All editable keys, used to detect changes before saving. */
export const editableKeys = settingsSections.flatMap((section) =>
  section.fields.map((field) => field.key),
);
