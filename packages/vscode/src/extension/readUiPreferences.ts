import * as vscode from 'vscode';
import type { SessionSnapshot } from '../../../protocol/src/SessionSnapshot.js';

export function readUiPreferences(): Pick<SessionSnapshot, 'language' | 'textSize'> {
  const config = vscode.workspace.getConfiguration('kova');
  const language = config.get<string>('ui.language', 'en');
  const textSize = config.get<string>('ui.textSize', 'standard');
  return {
    language: language === 'sr' || language === 'de' ? language : 'en',
    textSize: textSize === 'large' || textSize === 'larger' ? textSize : 'standard',
  };
}
