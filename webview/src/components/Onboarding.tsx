import { useI18n } from '../i18n/I18n.js';
import type { AgentMode } from '../../../packages/protocol/src/AgentMode.js';
import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import { inHost, send } from '../messaging/bridge.js';

export function Onboarding({
  snapshot,
  mode,
  onModeChange,
  onClose,
}: {
  snapshot: SessionSnapshot;
  mode: AgentMode;
  onModeChange(mode: AgentMode): void;
  onClose(): void;
}) {
  const { t } = useI18n();
  const ready = snapshot.providerStatus === 'Available';
  const finish = () => {
    send({ type: 'CompleteSetup' });
    onClose();
  };
  return (
    <section className="onboarding" aria-labelledby="setup-title">
      <div className="setup-intro">
        <span className="eyebrow">{t('GET STARTED')}</span>
        <h1 id="setup-title">{t('Make Kova yours')}</h1>
        <p>{t('Connect a model, choose how you work, and start with your code.')}</p>
      </div>
      {snapshot.desktop && (
        <div className="setup-project">
          <button
            onClick={() => send({ type: 'OpenWorkspace' })}
            disabled={snapshot.configuringProvider}
          >
            {snapshot.desktop.workspacePath
              ? t('Project: {name}', { name: snapshot.desktop.workspaceName })
              : t('Open a project')}
          </button>
        </div>
      )}
      <ol className="setup-steps">
        <li>
          <span className={`step-number ${ready ? 'complete' : ''}`}>1</span>
          <div>
            <h2>{t('Connect your AI provider')}</h2>
            <p>
              {t(
                'Run locally with Ollama or LM Studio, connect a cloud provider, or use any OpenAI-compatible API.',
              )}
            </p>
            <button
              className="primary"
              disabled={!inHost || snapshot.configuringProvider}
              onClick={() => send({ type: 'OpenProviderSetup' })}
            >
              {snapshot.configuringProvider
                ? snapshot.desktop
                  ? t('Saving connection…')
                  : t('Setup open in VS Code…')
                : ready
                  ? t('Change provider')
                  : t('Configure provider')}
            </button>
            <small>
              {snapshot.desktop
                ? t('API keys stay on this device.')
                : t('API keys stay in VS Code secure storage.')}
            </small>
          </div>
        </li>
        <li>
          <span className={`step-number ${ready ? 'complete' : ''}`}>2</span>
          <div>
            <h2>{t('Choose a model')}</h2>
            <p>
              {snapshot.desktop
                ? t(
                    'Load models in provider settings and choose a chat model, or enter its ID manually.',
                  )
                : t(
                    'The setup wizard checks the model list and helps you pick a chat model. You can also enter its ID manually.',
                  )}
            </p>
            <div className="setup-status" role="status">
              <span className={`status-dot ${ready ? 'online' : ''}`} />
              <span>
                {snapshot.providerLabel} ·{' '}
                {ready
                  ? snapshot.selectedModelId
                  : snapshot.providerStatus === 'ModelMissing'
                    ? t('Install or choose a model')
                    : t('Waiting for connection')}
              </span>
            </div>
            {!ready && (
              <button
                disabled={snapshot.configuringProvider}
                onClick={() => send({ type: 'RetryProvider' })}
              >
                {t('Check connection again')}
              </button>
            )}
          </div>
        </li>
        <li>
          <span className="step-number">3</span>
          <div>
            <h2>{t('Choose your working style')}</h2>
            <label className="setup-mode">
              {t('Permissions')}
              <select
                aria-label={t('Setup permissions')}
                value={mode}
                disabled={snapshot.configuringProvider}
                onChange={(event) => onModeChange(event.target.value as AgentMode)}
              >
                <option value="Plan">{t('Plan · read and explain code')}</option>
                <option value="Manual">{t('Manual · approve edits and commands')}</option>
                <option value="Edit">{t('Edit · automatic edits, approve commands')}</option>
                <option value="Auto">{t('Auto · automatic edits and allowlisted commands')}</option>
              </select>
            </label>
            <p>
              {snapshot.desktop
                ? t('Use Add context to attach project files or the current preview.')
                : t('Use Add context to attach a file or selection.')}{' '}
              {t('You can change the provider, model and mode at any time.')}
            </p>
          </div>
        </li>
      </ol>
      <div className="setup-actions">
        <button
          className="primary"
          disabled={!ready || snapshot.configuringProvider}
          onClick={finish}
        >
          {t('Start chatting')}
        </button>
        <button disabled={snapshot.configuringProvider} onClick={finish}>
          {t('Set up later')}
        </button>
        <button onClick={() => send({ type: 'OpenSetupInstructions' })}>{t('Setup guide')}</button>
      </div>
    </section>
  );
}
