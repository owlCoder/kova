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
  const ready = snapshot.providerStatus === 'Available';
  const finish = () => {
    send({ type: 'CompleteSetup' });
    onClose();
  };
  return (
    <section className="onboarding" aria-labelledby="setup-title">
      <div className="setup-intro">
        <span className="eyebrow">GET STARTED</span>
        <h1 id="setup-title">Make Kova yours</h1>
        <p>Connect a model, choose how you work, and start with your code.</p>
      </div>
      {snapshot.desktop && (
        <div className="setup-project">
          <button
            onClick={() => send({ type: 'OpenWorkspace' })}
            disabled={snapshot.configuringProvider}
          >
            {snapshot.desktop.workspacePath
              ? `Project: ${snapshot.desktop.workspaceName}`
              : 'Open a project'}
          </button>
        </div>
      )}
      <ol className="setup-steps">
        <li>
          <span className={`step-number ${ready ? 'complete' : ''}`}>1</span>
          <div>
            <h2>Connect your AI provider</h2>
            <p>
              Run locally with Ollama or LM Studio, connect a cloud provider, or use any
              OpenAI-compatible API.
            </p>
            <button
              className="primary"
              disabled={!inHost || snapshot.configuringProvider}
              onClick={() => send({ type: 'OpenProviderSetup' })}
            >
              {snapshot.configuringProvider
                ? 'Setup open in VS Code…'
                : ready
                  ? 'Change provider'
                  : 'Configure provider'}
            </button>
            <small>
              {snapshot.desktop
                ? 'API keys stay on this device.'
                : 'API keys stay in VS Code secure storage.'}
            </small>
          </div>
        </li>
        <li>
          <span className={`step-number ${ready ? 'complete' : ''}`}>2</span>
          <div>
            <h2>Choose a model</h2>
            <p>
              The setup wizard checks the model list and helps you pick a chat model. You can also
              enter its ID manually.
            </p>
            <div className="setup-status" role="status">
              <span className={`status-dot ${ready ? 'online' : ''}`} />
              <span>
                {snapshot.providerLabel} ·{' '}
                {ready
                  ? snapshot.selectedModelId
                  : snapshot.providerStatus === 'ModelMissing'
                    ? 'Install or choose a model'
                    : 'Waiting for connection'}
              </span>
            </div>
            {!ready && (
              <button
                disabled={snapshot.configuringProvider}
                onClick={() => send({ type: 'RetryProvider' })}
              >
                Check connection again
              </button>
            )}
          </div>
        </li>
        <li>
          <span className="step-number">3</span>
          <div>
            <h2>Choose your working style</h2>
            <label className="setup-mode">
              Permissions
              <select
                aria-label="Setup permissions"
                value={mode}
                disabled={snapshot.configuringProvider}
                onChange={(event) => onModeChange(event.target.value as AgentMode)}
              >
                <option value="Plan">Plan · read and explain code</option>
                <option value="Manual">Manual · approve edits and commands</option>
                <option value="Edit">Edit · automatic edits, approve commands</option>
                <option value="Auto">Auto · automatic edits and allowlisted commands</option>
              </select>
            </label>
            <p>
              Use Add context to attach a file or selection. You can change the provider, model and
              mode at any time.
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
          Start chatting
        </button>
        <button disabled={snapshot.configuringProvider} onClick={finish}>
          Set up later
        </button>
        <button onClick={() => send({ type: 'OpenSetupInstructions' })}>Setup guide</button>
      </div>
    </section>
  );
}
