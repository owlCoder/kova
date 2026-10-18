import { BrandMark } from '../components/BrandMark.js';
import type { DesktopState } from '../../../packages/protocol/src/DesktopState.js';
import { send } from '../messaging/bridge.js';
import { Icon } from '../components/Icon.js';
import { useI18n } from '../i18n/I18n.js';

export function AboutKova({ desktop }: { desktop: DesktopState }) {
  const { t } = useI18n();
  const mod = desktop.platform === 'darwin' ? '⌘' : t('Ctrl');
  const diagnostics = `Kova ${desktop.appVersion}\nPlatform: ${desktop.platform}\nElectron: ${desktop.runtimeVersions.electron}\nChromium: ${desktop.runtimeVersions.chrome}\nNode: ${desktop.runtimeVersions.node}\nLanguage: ${desktop.language}\nProvider format: ${desktop.provider.kind}\nTheme: ${desktop.theme}\nText size: ${desktop.textSize}`;
  return (
    <>
      <div className="about-hero">
        <BrandMark />
        <span className="eyebrow">KOVA DESKTOP</span>
        <h2>{t('Your code. Your models. Your workspace.')}</h2>
        <p>
          {t(
            'A thoughtful home for your projects, models and ideas. Built for local-first work, with you in control of every change.',
          )}
        </p>
        <span className="version-pill">
          Kova {desktop.appVersion} <span>·</span>{' '}
          {t(
            { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }[desktop.platform] ??
              desktop.platform,
          )}
        </span>
      </div>
      <div className="about-capabilities">
        <article>
          <Icon name="sparkles" />
          <h3>{t('Your models')}</h3>
          <p>
            {t('Ollama and compatible local or cloud providers. No automatic provider switching.')}
          </p>
        </article>
        <article>
          <Icon name="review" />
          <h3>{t('Your decisions')}</h3>
          <p>{t('Review proposed changes, choose permissions and stop the agent at any time.')}</p>
        </article>
        <article>
          <Icon name="terminal" />
          <h3>{t('Your tools')}</h3>
          <p>
            {t(
              'Project files, Git diffs, skills, MCP and an interactive terminal in one workspace.',
            )}
          </p>
        </article>
      </div>
      <section className="settings-section">
        <h3>{t('Privacy & local data')}</h3>
        <ul className="privacy-list">
          <li>{t('No analytics or telemetry.')}</li>
          <li>{t('History and preferences are stored on this device.')}</li>
          <li>{t('API keys use OS encryption, with a memory-only fallback.')}</li>
          <li>{t('Prompts and context go to the AI endpoint you choose.')}</li>
          <li>
            {t(
              'Terminal commands run with your user permissions. They are separate from AI approvals.',
            )}
          </li>
        </ul>
        <button onClick={() => send({ type: 'OpenDataDirectory' })}>
          <Icon name="folderOpen" size={16} />
          {t('Open local data folder')}
        </button>
      </section>
      <section className="settings-section">
        <h3>{t('Keyboard shortcuts')}</h3>
        <div className="shortcut-list">
          {[
            ['Commands & sessions', `${mod} K`],
            ['Find files', `${mod} P`],
            ['Find in conversation', `${mod} F`],
            ['New session', `${mod} N`],
            ['Open project', `${mod} O`],
            ['Toggle terminal', `${mod} ⇧ T`],
            ['Settings', `${mod} ,`],
          ].map(([label, keys]) => (
            <span key={label}>
              <span>{t(label!)}</span>
              <kbd>{keys}</kbd>
            </span>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <h3>{t('Help & community')}</h3>
        <div className="about-links">
          {[
            ['Documentation', 'docs/DESKTOP.md'],
            ['What’s new', 'CHANGELOG.md'],
            ['Report an issue', 'issues/new'],
            ['Source code', ''],
            ['MIT license', 'LICENSE'],
          ].map(([label, path]) => (
            <button
              key={label}
              onClick={() =>
                send({
                  type: 'OpenExternal',
                  url: `https://github.com/owlCoder/kova/${path === 'issues/new' ? path : path ? `blob/main/${path}` : ''}`,
                })
              }
            >
              {t(label!)}
              <Icon name="external" size={14} />
            </button>
          ))}
        </div>
      </section>
      <details className="runtime-details">
        <summary>{t('Runtime details')}</summary>
        <dl>
          <dt>Electron</dt>
          <dd>{desktop.runtimeVersions.electron}</dd>
          <dt>Chromium</dt>
          <dd>{desktop.runtimeVersions.chrome}</dd>
          <dt>Node.js</dt>
          <dd>{desktop.runtimeVersions.node}</dd>
          <dt>{t('License')}</dt>
          <dd>MIT · Kova contributors</dd>
        </dl>
        <button onClick={() => send({ type: 'CopyText', text: diagnostics })}>
          <Icon name="copy" size={14} />
          {t('Copy diagnostics')}
        </button>
        <small>
          {t(
            'Contains version and environment information. No keys, conversations or project paths.',
          )}
        </small>
      </details>
    </>
  );
}
