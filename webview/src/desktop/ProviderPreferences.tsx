import { useEffect, useRef, useState } from 'react';
import type { DesktopState } from '../../../packages/protocol/src/DesktopState.js';
import type { ProviderDraft } from '../../../packages/protocol/src/DesktopMessage.js';
import type { ModelInfo } from '../../../packages/protocol/src/ModelInfo.js';
import { send, subscribe } from '../messaging/bridge.js';
import { Icon } from '../components/Icon.js';

export function ProviderPreferences({
  desktop,
  busy,
  onClose,
}: {
  desktop: DesktopState;
  busy: boolean;
  onClose(): void;
}) {
  const [tab, setTab] = useState<'provider' | 'appearance' | 'about'>('provider');
  const [draft, setDraft] = useState<ProviderDraft>({
    kind: desktop.provider.kind,
    label: desktop.provider.label,
    baseUrl: desktop.provider.baseUrl,
    model: desktop.provider.model,
    supportsTools: desktop.provider.supportsTools,
    discoverModels: desktop.provider.discoverModels,
    thinking: desktop.provider.thinking,
    apiKey: '',
    keyAction: 'keep',
    rememberKey: true,
  });
  const [models, setModels] = useState<readonly ModelInfo[]>([]);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(false);
  const requests = useRef({ test: '', save: '' });
  const dialog = useRef<HTMLDivElement>(null);
  const update = (patch: Partial<ProviderDraft>) => {
    setDraft((previous) => ({ ...previous, ...patch }));
    setChecked(false);
    setError('');
  };
  useEffect(
    () =>
      subscribe((message) => {
        if (message.type === 'ProviderModels' && message.requestId === requests.current.test) {
          setChecking(false);
          setModels(message.models);
          setError(message.error ?? '');
          setChecked(!message.error);
          if (!draft.model && message.models.length === 1)
            setDraft((previous) => ({ ...previous, model: message.models[0]!.id }));
        }
        if (message.type === 'Accepted' && message.requestId === requests.current.save) {
          setSaving(false);
          onClose();
        }
        if (
          message.type === 'Rejected' &&
          [requests.current.test, requests.current.save].includes(message.requestId)
        ) {
          setChecking(false);
          setSaving(false);
          setError(message.message);
        }
      }),
    [draft.model, onClose],
  );
  useEffect(() => {
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);
  const preset = desktop.providerPresets.findIndex(
    (preset) => preset.kind === draft.kind && preset.baseUrl === draft.baseUrl,
  );
  const storedKey =
    desktop.provider.hasApiKey &&
    desktop.provider.kind === draft.kind &&
    desktop.provider.baseUrl === draft.baseUrl;
  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="preferences-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-title"
        ref={dialog}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !saving) onClose();
          if (event.key === 'Tab') {
            const controls = [
              ...(dialog.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]',
              ) ?? []),
            ];
            const first = controls[0],
              last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <nav className="preferences-nav">
          <h2 id="preferences-title">Settings</h2>
          <small>MAKE KOVA YOURS</small>
          <button className={tab === 'provider' ? 'active' : ''} onClick={() => setTab('provider')}>
            <Icon name="sparkles" />
            AI connection
          </button>
          <button
            className={tab === 'appearance' ? 'active' : ''}
            onClick={() => setTab('appearance')}
          >
            <Icon name="monitor" />
            Appearance
          </button>
          <button className={tab === 'about' ? 'active' : ''} onClick={() => setTab('about')}>
            <Icon name="help" />
            About Kova
          </button>
          <span className="settings-version">Kova {desktop.appVersion}</span>
        </nav>
        <div className="preferences-content">
          <button
            className="modal-close icon-button"
            aria-label="Close settings"
            onClick={onClose}
            disabled={saving}
          >
            <Icon name="close" />
          </button>
          {tab === 'provider' && (
            <>
              <div className="eyebrow">AI CONNECTION</div>
              <h2>Bring your own intelligence.</h2>
              <p className="settings-description">
                Local models or cloud APIs. Your provider, your choice.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setSaving(true);
                  setError('');
                  requests.current.save = send({ type: 'SaveProvider', draft });
                }}
              >
                <label>
                  Provider
                  <select
                    aria-label="AI provider preset"
                    value={preset < 0 ? 'custom' : String(preset)}
                    onChange={(event) => {
                      const selected = desktop.providerPresets[Number(event.target.value)];
                      if (selected)
                        update({
                          kind: selected.kind,
                          label: selected.label,
                          baseUrl: selected.baseUrl,
                          model: selected.model,
                          supportsTools: selected.supportsTools,
                          discoverModels: selected.discoverModels,
                          thinking: false,
                          apiKey: '',
                          keyAction: 'keep',
                        });
                      setModels([]);
                    }}
                  >
                    {preset < 0 && <option value="custom">Custom connection</option>}
                    {desktop.providerPresets.map((preset, i) => (
                      <option key={preset.label} value={i}>
                        {preset.label} · {preset.description.split(' · ')[0]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="settings-grid">
                  <label>
                    Connection name
                    <input
                      value={draft.label}
                      maxLength={100}
                      onChange={(event) => update({ label: event.target.value })}
                      required
                    />
                  </label>
                  <label>
                    API format
                    <select
                      value={draft.kind}
                      onChange={(event) =>
                        update({
                          kind: event.target.value as ProviderDraft['kind'],
                          thinking: false,
                        })
                      }
                    >
                      <option value="ollama">Ollama</option>
                      <option value="deepseek">DeepSeek</option>
                      <option value="openaiCompatible">OpenAI compatible</option>
                    </select>
                  </label>
                </div>
                <label>
                  API base URL
                  <input
                    type="url"
                    spellCheck={false}
                    value={draft.baseUrl}
                    onChange={(event) => update({ baseUrl: event.target.value })}
                    placeholder="http://localhost:11434"
                    required
                  />
                  <small>Use the base endpoint. Kova adds the API paths.</small>
                </label>
                {draft.kind !== 'ollama' && (
                  <div className="provider-key-field">
                    <label htmlFor="provider-api-key">
                      API key{' '}
                      <span className="optional">
                        {storedKey ? 'Saved for this endpoint' : 'Optional for local servers'}
                      </span>
                    </label>
                    <input
                      id="provider-api-key"
                      aria-label="Provider API key"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={draft.apiKey}
                      placeholder={
                        storedKey && draft.keyAction !== 'remove'
                          ? '•••••••• · leave blank to keep saved key'
                          : 'Enter your provider API key'
                      }
                      maxLength={8192}
                      onChange={(event) =>
                        update({
                          apiKey: event.target.value,
                          keyAction: event.target.value ? 'replace' : 'keep',
                        })
                      }
                    />
                    <span className="key-options">
                      <span>
                        <input
                          id="remember-key"
                          type="checkbox"
                          checked={draft.rememberKey}
                          onChange={(event) => update({ rememberKey: event.target.checked })}
                        />
                        <label htmlFor="remember-key">Remember securely on this device</label>
                      </span>
                      {storedKey && (
                        <button
                          type="button"
                          onClick={() =>
                            update({
                              keyAction: draft.keyAction === 'remove' ? 'keep' : 'remove',
                              apiKey: '',
                            })
                          }
                        >
                          {draft.keyAction === 'remove' ? 'Keep stored key' : 'Remove key'}
                        </button>
                      )}
                    </span>
                  </div>
                )}
                <label>
                  Model
                  <div className="model-input-row">
                    <input
                      aria-label="Provider model ID"
                      list="provider-models"
                      value={draft.model}
                      spellCheck={false}
                      onChange={(event) => update({ model: event.target.value })}
                      placeholder="Choose or enter a chat model ID"
                      maxLength={256}
                      required
                    />
                    <button
                      type="button"
                      disabled={checking || saving}
                      onClick={() => {
                        setChecking(true);
                        setError('');
                        requests.current.test = send({
                          type: 'TestProvider',
                          draft: { ...draft, discoverModels: true },
                        });
                      }}
                    >
                      <Icon name={checking ? 'refresh' : 'search'} size={14} />
                      {checking ? 'Checking…' : 'Load models'}
                    </button>
                  </div>
                  <datalist id="provider-models">
                    {models.map((model) => (
                      <option value={model.id} key={model.id}>
                        {model.displayName}
                      </option>
                    ))}
                  </datalist>
                  <small>
                    Choose a chat-capable model. Loading models sends no project content.
                  </small>
                </label>
                {draft.kind === 'openaiCompatible' && (
                  <>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={draft.discoverModels}
                        onChange={(event) => update({ discoverModels: event.target.checked })}
                      />
                      <span>
                        Discover available models
                        <small>Turn off for APIs that only accept a manual model ID.</small>
                      </span>
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={draft.supportsTools}
                        onChange={(event) => update({ supportsTools: event.target.checked })}
                      />
                      <span>
                        Enable workspace tools
                        <small>The model must support function calling.</small>
                      </span>
                    </label>
                  </>
                )}
                {draft.kind !== 'openaiCompatible' && (
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={draft.thinking}
                      onChange={(event) => update({ thinking: event.target.checked })}
                    />
                    <span>
                      Enable model thinking
                      <small>Show transient reasoning when the model supports it.</small>
                    </span>
                  </label>
                )}
                {checked && (
                  <div className="settings-success">
                    <Icon name="check" size={15} />
                    Connection checked · {models.length} models available
                  </div>
                )}
                {error && (
                  <div className="settings-error" role="alert">
                    <Icon name="warning" size={15} />
                    {error}
                  </div>
                )}
                {busy && !saving && (
                  <div className="settings-error">
                    Stop the active task before saving a connection.
                  </div>
                )}
                <div className="settings-footer">
                  <span>
                    <Icon name="shield" size={13} />
                    Keys never enter model context.
                  </span>
                  <button
                    className="primary"
                    type="submit"
                    disabled={saving || checking || busy || !draft.model.trim()}
                  >
                    {saving ? 'Saving…' : 'Save connection'}
                    <Icon name="arrow" size={14} />
                  </button>
                </div>
              </form>
            </>
          )}
          {tab === 'appearance' && (
            <>
              <div className="eyebrow">APPEARANCE</div>
              <h2>A space that feels right.</h2>
              <p className="settings-description">Choose how Kova looks on this device.</p>
              <div className="theme-options">
                {(['dark', 'light', 'system'] as const).map((theme) => (
                  <button
                    key={theme}
                    className={`theme-option ${desktop.theme === theme ? 'selected' : ''}`}
                    onClick={() => send({ type: 'SetTheme', theme })}
                  >
                    <Icon
                      name={theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'monitor'}
                      size={27}
                    />
                    <strong>{theme.charAt(0).toUpperCase() + theme.slice(1)}</strong>
                    <span>{desktop.theme === theme ? 'Selected' : 'Use theme'}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {tab === 'about' && (
            <>
              <div className="eyebrow">KOVA DESKTOP</div>
              <h2>Your code. Your workspace.</h2>
              <p className="settings-description">
                A local-first coding agent for focused work. Built on the same agent runtime as the
                Kova VS Code extension.
              </p>
              <div className="about-facts">
                <span>
                  Version<strong>{desktop.appVersion}</strong>
                </span>
                <span>
                  Platform<strong>{desktop.platform}</strong>
                </span>
                <span>
                  Session storage<strong>On this device</strong>
                </span>
                <span>
                  Telemetry<strong>None</strong>
                </span>
              </div>
              <button
                onClick={() =>
                  send({ type: 'OpenExternal', url: 'https://github.com/owlCoder/kova' })
                }
              >
                <Icon name="external" size={14} />
                Source & documentation
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
