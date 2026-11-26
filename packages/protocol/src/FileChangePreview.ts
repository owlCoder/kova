/** Capped before/after text for one file shown in an approval preview. */
export interface FileChangePreview {
  readonly relativePath: string;
  readonly operation: 'Create' | 'Replace';
  /** Null for new files. */
  readonly before: string | null;
  readonly after: string;
  readonly truncated: boolean;
}
