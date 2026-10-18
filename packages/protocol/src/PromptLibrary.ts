export type SavedPrompt = {
  readonly id: string;
  readonly title: string;
  readonly text: string;
};

export type PromptLibrary = {
  readonly version: 1;
  readonly revision: string;
  readonly prompts: readonly SavedPrompt[];
};

export type PromptLibraryMessage =
  | { readonly type: 'GetPromptLibrary' }
  | {
      readonly type: 'SavePrompt';
      readonly revision: string;
      readonly id: string | null;
      readonly title: string;
      readonly text: string;
    }
  | { readonly type: 'DeletePrompt'; readonly revision: string; readonly id: string };
