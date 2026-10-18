import { dialog, clipboard, type BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';

export async function exportTranscript(
  window: BrowserWindow,
  markdown: string,
  action: 'copy' | 'save',
): Promise<boolean> {
  if (action === 'copy') {
    clipboard.writeText(markdown);
    return true;
  }
  const result = await dialog.showSaveDialog(window, {
    title: 'Export Kova conversation',
    defaultPath: join(app.getPath('documents'), 'kova-conversation.md'),
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (result.canceled || !result.filePath) return false;
  if (!result.filePath.toLowerCase().endsWith('.md'))
    throw new Error('Choose a Markdown (.md) file for the export.');
  await writeFile(result.filePath, markdown, 'utf8');
  return true;
}
