import { useCallback, useEffect, useRef, useState } from 'react';
import type { HostMessage } from '../../../packages/protocol/src/HostMessage.js';
import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import { isDesktop, send, subscribe } from '../messaging/bridge.js';

type Files = Extract<HostMessage, { type: 'WorkspaceFiles' }>;
type Preview = Extract<HostMessage, { type: 'FilePreview' | 'DiffPreview' }>;
export function useHostResources(snapshot: SessionSnapshot | null) {
  const [search, setSearch] = useState<Extract<
    HostMessage,
    { type: 'WorkspaceSearchResults' }
  > | null>(null);
  const [files, setFiles] = useState<Files | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [preferencesTab, setPreferencesTab] = useState<'provider' | 'appearance' | 'about'>(
    'provider',
  );
  const [preferences, updatePreferences] = useState(false);
  // Capture the opener before the lazy settings module loads and the workspace becomes inert.
  const preferenceFocus = useRef<{ open: boolean; element: HTMLElement | null }>({
    open: false,
    element: null,
  });
  const setPreferences = useCallback((open: boolean) => {
    if (open && !preferenceFocus.current.open)
      preferenceFocus.current.element =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    preferenceFocus.current.open = open;
    updatePreferences(open);
    if (!open)
      requestAnimationFrame(() => {
        const element = preferenceFocus.current.element;
        if (element?.isConnected && !element.closest('[inert]'))
          element.focus({ preventScroll: true });
      });
  }, []);
  const [notice, setNotice] = useState('');
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<'files' | 'changes' | 'activity'>('files');
  const current = useRef({
    directory: '.',
    preview: null as string | null,
    open: true,
    autoDirectory: null as string | null,
  });
  useEffect(() => {
    current.current.open = inspectorOpen;
  }, [inspectorOpen]);
  const root = snapshot?.desktop?.workspacePath;
  useEffect(
    () =>
      subscribe((message) => {
        if (message.type === 'Notice' || message.type === 'Rejected') setNotice(message.message);
        if (message.type === 'OpenPreferences') {
          setPreferencesTab(message.section ?? 'provider');
          setPreferences(true);
        }
        if (message.type === 'WorkspaceSearchResults' && message.workspaceId === root)
          setSearch(message);
        if (
          message.type === 'Event' &&
          message.event.type === 'ToolCompleted' &&
          message.event.result.status === 'Success' &&
          ['edit_file', 'write_file'].includes(message.event.result.toolName)
        ) {
          setPreview((previous) =>
            previous?.type === 'DiffPreview' && previous.title === 'Proposed changes'
              ? { ...previous, title: 'Applied change' }
              : previous,
          );
          if (isDesktop && root && current.current.open) {
            if (current.current.preview)
              send({ type: 'OpenWorkspaceFile', path: current.current.preview });
            else {
              current.current.autoDirectory = current.current.directory;
              send({ type: 'ListWorkspaceFiles', path: current.current.directory });
            }
          }
        }
        if (message.type === 'WorkspaceFiles' && message.workspaceId === root) {
          current.current.directory = message.path;
          setFiles(message);
          const automatic = current.current.autoDirectory === message.path;
          current.current.autoDirectory = null;
          if (!automatic) {
            setInspectorOpen(true);
            setInspectorTab('files');
          }
        }
        if (message.type === 'FilePreview' && message.workspaceId === root) {
          current.current.preview = message.file.path;
          setPreview(message);
          setInspectorOpen(true);
          setInspectorTab('files');
        }
        if (message.type === 'DiffPreview' && message.workspaceId === root) {
          current.current.preview = null;
          setPreview(message);
          setInspectorOpen(true);
          setInspectorTab('changes');
        }
      }),
    [root, setPreferences],
  );
  useEffect(() => {
    current.current.autoDirectory = null;
    setSearch(null);
    current.current.directory = '.';
    current.current.preview = null;
    setFiles(null);
    setPreview(null);
    if (isDesktop && root) send({ type: 'ListWorkspaceFiles', path: '.' });
  }, [root]);
  useEffect(() => {
    current.current.preview = preview?.type === 'FilePreview' ? preview.file.path : null;
  }, [preview]);
  useEffect(() => {
    setPreview((previous) => (previous?.type === 'DiffPreview' ? null : previous));
  }, [snapshot?.conversationId]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 8000);
    return () => clearTimeout(timeout);
  }, [notice]);
  return {
    files,
    search,
    preview,
    setPreview,
    preferencesTab,
    setPreferencesTab,
    preferences,
    setPreferences,
    notice,
    setNotice,
    inspectorOpen,
    setInspectorOpen,
    inspectorTab,
    setInspectorTab,
  };
}
