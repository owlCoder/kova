export type ToolPreview =
  | {
      readonly kind: 'FileChanges';
      readonly changes: readonly {
        readonly relativePath: string;
        readonly operation: 'Create' | 'Replace';
        readonly beforeContent: string | null;
        readonly afterContent: string;
        readonly expectedVersion: string | null;
      }[];
    }
  | {
      readonly kind: 'Command';
      readonly command: string;
      readonly relativeWorkingDirectory: string;
    }
  | { readonly kind: 'Description'; readonly text: string };
