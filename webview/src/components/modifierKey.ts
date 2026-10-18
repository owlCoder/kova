export function modifierKey(platform?: string): string {
  const mac = platform ? platform === 'darwin' : /Mac/i.test(navigator.platform);
  return mac ? '⌘' : 'Ctrl';
}
