import { useI18n } from '../i18n/I18n.js';
import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import logo from '../../../assets/logo.png';
import { isDesktop, send } from '../messaging/bridge.js';
import { Icon } from './Icon.js';

export function Welcome({
  snapshot,
  onChoose,
}: {
  snapshot: SessionSnapshot | null;
  onChoose(value: string): void;
}) {
  const { t } = useI18n();
  const project = snapshot?.desktop?.workspaceName;
  return (
    <section className="welcome">
      <div className="welcome-mark">
        <img src={logo} alt="" />
      </div>
      <div className="eyebrow">
        <span className="welcome-rule" />
        {t('YOUR WORKSPACE')}
      </div>
      <h1>{t('What are we working on?')}</h1>
      <p>
        {project && snapshot?.desktop?.workspacePath
          ? t(
              'You’re working in {project}. Ask a question, explore your code, or make something new.',
              { project },
            )
          : t('A focused space to think, build, and ship. Connect your AI and make it yours.')}
      </p>
      {isDesktop && !snapshot?.desktop?.workspacePath && (
        <button
          className="primary open-project-hero"
          onClick={() => send({ type: 'OpenWorkspace' })}
        >
          <Icon name="folderOpen" />
          {t('Open a project')}
          <kbd>
            {snapshot?.desktop?.platform === 'darwin' ? '⌘' : t('Ctrl')}
            {t('O')}
          </kbd>
        </button>
      )}
      <div className="suggestions">
        <button
          onClick={() =>
            onChoose(
              'Explore this project and explain its architecture. Read the relevant files before answering.',
            )
          }
        >
          <span className="suggestion-index">01</span>
          <Icon name="code" />
          <span className="suggestion-copy">
            <strong>{t('Explore the code')}</strong>
            <small>{t('Understand how it fits together')}</small>
          </span>
          <Icon name="upLeft" />
        </button>
        <button
          onClick={() =>
            onChoose('Review the current Git diff for bugs, regressions and missing tests.')
          }
        >
          <span className="suggestion-index">02</span>
          <Icon name="review" />
          <span className="suggestion-copy">
            <strong>{t('Review changes')}</strong>
            <small>{t('Find what needs a closer look')}</small>
          </span>
          <Icon name="upLeft" />
        </button>
        <button
          onClick={() =>
            onChoose(
              'Help me plan a change. Inspect the relevant code, then outline a practical implementation.',
            )
          }
        >
          <span className="suggestion-index">03</span>
          <Icon name="sparkles" />
          <span className="suggestion-copy">
            <strong>{t('Plan something new')}</strong>
            <small>{t('Turn an idea into a clear next step')}</small>
          </span>
          <Icon name="upLeft" />
        </button>
      </div>
      <div className="welcome-note">
        <Icon name="shield" size={13} />
        {t('Local-first. You choose where your context goes.')}
      </div>
    </section>
  );
}
