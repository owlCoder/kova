import { Menu, type MenuItemConstructorOptions } from 'electron';
import { randomUUID } from 'node:crypto';
import type { DesktopController } from './DesktopController.js';
import type { DesktopSession } from './DesktopSession.js';

export function createDesktopMenu(
  controller: DesktopController,
  session: DesktopSession,
  packaged: boolean,
): Menu {
  const labels: Record<string, readonly [string, string]> = {
    Undo: ['Opozovi', 'Rückgängig'],
    Redo: ['Ponovi', 'Wiederholen'],
    Cut: ['Iseci', 'Ausschneiden'],
    Copy: ['Kopiraj', 'Kopieren'],
    Paste: ['Nalepi', 'Einfügen'],
    'Select All': ['Izaberi sve', 'Alles auswählen'],
    Close: ['Zatvori', 'Schließen'],
    Quit: ['Izađi', 'Beenden'],
    'Full Screen': ['Ceo ekran', 'Vollbild'],
    'Actual Size': ['Stvarna veličina', 'Originalgröße'],
    'Zoom In': ['Uvećaj', 'Vergrößern'],
    'Zoom Out': ['Umanji', 'Verkleinern'],
    'Developer Tools': ['Alati za razvoj', 'Entwicklerwerkzeuge'],
    'About Kova': ['O aplikaciji Kova', 'Über Kova'],
    File: ['Datoteka', 'Datei'],
    'Open Project…': ['Otvori projekat…', 'Projekt öffnen…'],
    'New Session': ['Nova sesija', 'Neue Sitzung'],
    Settings: ['Podešavanja', 'Einstellungen'],
    Edit: ['Uređivanje', 'Bearbeiten'],
    View: ['Prikaz', 'Ansicht'],
    Terminal: ['Terminal', 'Terminal'],
    'Toggle Terminal': ['Prikaži / sakrij terminal', 'Terminal ein-/ausblenden'],
    Help: ['Pomoć', 'Hilfe'],
  };
  const t = (text: string) =>
    labels[text]?.[session.store.preferences.language === 'sr' ? 0 : 1] &&
    session.store.preferences.language !== 'en'
      ? labels[text]![session.store.preferences.language === 'sr' ? 0 : 1]!
      : text;
  const about: MenuItemConstructorOptions = {
    label: t('About Kova'),
    click: () => session.send({ type: 'OpenPreferences', section: 'about' }),
  };
  return Menu.buildFromTemplate([
    ...(process.platform === 'darwin'
      ? [
          {
            label: 'Kova',
            submenu: [
              about,
              { type: 'separator' as const },
              { label: t('Quit'), role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: t('File'),
      submenu: [
        {
          label: t('Open Project…'),
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            void controller.handle({
              protocolVersion: 1,
              requestId: randomUUID(),
              type: 'OpenWorkspace',
            });
          },
        },
        {
          label: t('New Session'),
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            void session.newConversation().catch((error: unknown) =>
              session.send({
                type: 'Notice',
                message: error instanceof Error ? error.message : 'Could not open a session.',
              }),
            );
          },
        },
        {
          label: t('Settings'),
          accelerator: 'CmdOrCtrl+,',
          click: () => session.send({ type: 'OpenPreferences' }),
        },
        { type: 'separator' },
        { label: t('Close'), role: 'close' },
      ],
    },
    {
      label: t('Edit'),
      submenu: [
        { label: t('Undo'), role: 'undo' },
        { label: t('Redo'), role: 'redo' },
        { type: 'separator' },
        { label: t('Cut'), role: 'cut' },
        { label: t('Copy'), role: 'copy' },
        { label: t('Paste'), role: 'paste' },
        { label: t('Select All'), role: 'selectAll' },
      ],
    },
    {
      label: t('View'),
      submenu: [
        { label: t('Full Screen'), role: 'togglefullscreen' },
        { label: t('Actual Size'), role: 'resetZoom' },
        { label: t('Zoom In'), role: 'zoomIn' },
        { label: t('Zoom Out'), role: 'zoomOut' },
        ...(!packaged ? [{ label: t('Developer Tools'), role: 'toggleDevTools' as const }] : []),
      ],
    },
    {
      label: t('Terminal'),
      submenu: [
        {
          label: t('Toggle Terminal'),
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => session.send({ type: 'ToggleTerminal' }),
        },
      ],
    },
    { label: t('Help'), submenu: [about] },
  ]);
}
