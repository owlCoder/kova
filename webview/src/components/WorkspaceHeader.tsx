import type { DesktopState } from '../../../packages/protocol/src/DesktopState.js';
import { isDesktop, send } from '../messaging/bridge.js';
import { useI18n } from '../i18n/I18n.js';
import { Icon } from './Icon.js';
import { BrandMark } from './BrandMark.js';
import { ConversationTools } from './ConversationTools.js';

export function WorkspaceHeader({
  desktop,
  title,
  busy,
  inspectorOpen,
  conversationId,
  hasMessages,
  onSidebar,
  onSetup,
  onPalette,
  onInspector,
  onPreferences,
  onFind,
}: {
  desktop: DesktopState | undefined;
  title: string;
  busy: boolean;
  inspectorOpen: boolean;
  conversationId: string | undefined;
  hasMessages: boolean;
  onSidebar(): void;
  onSetup(): void;
  onPalette(): void;
  onInspector(): void;
  onPreferences(): void;
  onFind(): void;
}) {
  const { t } = useI18n();
  return (
    <header className="workspace-header">
      <div className="workspace-breadcrumb">
        {isDesktop ? (
          <>
            <button
              className="icon-button"
              aria-label={t('Toggle sidebar')}
              title={t('Toggle sidebar')}
              onClick={() => onSidebar()}
            >
              <Icon name="panelLeft" size={16} />
            </button>
            <Icon name="folder" size={14} />
            <span className="breadcrumb-project" title={desktop?.workspacePath ?? undefined}>
              {desktop?.workspaceName ?? 'Kova'}
            </span>
            <span className="breadcrumb-divider">/</span>
            <span className="breadcrumb-session" title={title}>
              {title === 'New session' ? t('New session') : title}
            </span>
          </>
        ) : (
          <>
            <BrandMark />
            <strong>Kova</strong>
            <span className="extension-caption">{t('Coding workspace')}</span>
          </>
        )}
      </div>
      <div className="header-actions">
        <ConversationTools
          conversationId={conversationId}
          hasMessages={hasMessages}
          busy={busy}
          onFind={onFind}
        />
        <button
          className="setup-toggle"
          title={t('Setup')}
          aria-label={t('Setup')}
          disabled={busy}
          onClick={onSetup}
        >
          <Icon name="help" size={15} />
          <span>{t('Setup')}</span>
        </button>
        {!isDesktop && (
          <button
            className="icon-button"
            title={t('New conversation')}
            aria-label={t('New conversation')}
            disabled={busy}
            onClick={() => send({ type: 'NewConversation' })}
          >
            <Icon name="plus" />
          </button>
        )}
        <button
          className="icon-button"
          title={t('Commands and sessions')}
          aria-label={t('Commands and sessions')}
          onClick={onPalette}
        >
          <Icon name="command" size={16} />
        </button>
        {isDesktop ? (
          <button
            className={`icon-button ${inspectorOpen ? 'active' : ''}`}
            title={t('Toggle project panel')}
            aria-label={t('Toggle project panel')}
            onClick={onInspector}
          >
            <Icon name="panelRight" size={16} />
          </button>
        ) : (
          <button
            className="icon-button"
            title={t('Settings')}
            aria-label={t('Settings')}
            onClick={onPreferences}
          >
            <Icon name="settings" size={16} />
          </button>
        )}
      </div>
    </header>
  );
}
