import { useI18n } from '../i18n/I18n.js';
import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import { BrandMark } from './BrandMark.js';
import { isDesktop, send } from '../messaging/bridge.js';
import { Icon } from './Icon.js';
import { promptTemplates } from './promptTemplates.js';

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
        <BrandMark />
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
        {promptTemplates.slice(0, 3).map((item, index) => (
          <button key={item.id} disabled={!snapshot} onClick={() => onChoose(t(item.text))}>
            <span className="suggestion-index">0{index + 1}</span>
            <Icon name={item.icon} />
            <span className="suggestion-copy">
              <strong>{t(item.title)}</strong>
              <small>{t(item.description)}</small>
            </span>
            <Icon name="upLeft" />
          </button>
        ))}
      </div>
      <div className="welcome-note">
        <Icon name="shield" size={13} />
        {t('Your code. Your models. Your workspace.')}
      </div>
    </section>
  );
}
