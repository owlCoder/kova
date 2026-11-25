import { useCallback, useEffect, useRef, useState } from 'react';
import type { KovaSettingsView } from '../../../packages/protocol/src/KovaSettingsView.js';
import { send, subscribe } from '../messaging/bridge.js';

/**
 * Loads the chat-editable Kova settings on mount and applies the edited
 * values on save. Mounted only while the settings dialog is open.
 */
export function useKovaSettings() {
  const [settings, setSettings] = useState<KovaSettingsView | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef<{ id: string; timer: number } | null>(null);

  const load = useCallback(() => {
    setError('');
    const id = send({ type: 'GetSettings' });
    const timer = window.setTimeout(() => {
      pending.current = null;
      setError('Settings did not load. Try opening them again.');
    }, 15_000);
    pending.current = { id, timer };
  }, []);

  const save = useCallback((values: KovaSettingsView) => {
    if (pending.current) return;
    setError('');
    setSaving(true);
    const id = send({ type: 'UpdateSettings', values });
    const timer = window.setTimeout(() => {
      pending.current = null;
      setSaving(false);
      setError('Settings were not saved. Try again.');
    }, 15_000);
    pending.current = { id, timer };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribe((message) => {
      const current = pending.current;
      if (!current || !('requestId' in message) || message.requestId !== current.id) return;
      window.clearTimeout(current.timer);
      pending.current = null;
      if (message.type === 'Settings') {
        setSettings(message.settings);
        setSaving(false);
      } else if (message.type === 'Rejected') {
        setSaving(false);
        setError(message.message);
      }
    });
    load();
    return () => {
      unsubscribe();
      if (pending.current) window.clearTimeout(pending.current.timer);
    };
  }, [load]);

  return { settings, error, saving, load, save };
}
