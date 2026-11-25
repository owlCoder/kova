/**
 * Current values of the user-editable settings, keyed by configuration path
 * without the `kova.` prefix (for example `ui.language`). Values are plain
 * JSON scalars or string arrays so they survive webview messaging.
 */
export type KovaSettingsView = Readonly<
  Record<string, string | number | boolean | readonly string[]>
>;
