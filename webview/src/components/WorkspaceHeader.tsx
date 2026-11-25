import { send } from '../messaging/bridge.js';
import { useI18n } from '../i18n/I18n.js';
import { Icon } from './Icon.js';
import { BrandMark } from './BrandMark.js';
import { ConversationTools } from './ConversationTools.js';

/** Compact view toolbar, matching VS Code's own view title bars. */
export function WorkspaceHeader({
  title,
  busy,
  conversationId,
  hasMessages,
  onSetup,
  onPalette,
  onPreferences,
  onFind,
}: {
  title: string;
  busy: boolean;
  conversationId: string | undefined;
  hasMessages: boolean;
  onSetup(): void;
  onPalette(): void;
  onPreferences(): void;
  onFind(): void;
}) {
  const { t } = useI18n();
  return (
    <header className="workspace-header">
      <div className="workspace-breadcrumb">
        <BrandMark />
        <span className="header-title" title={title}>
          {title}
        </span>
      </div>
      <div className="header-actions">
        <button
          className="icon-button"
          title={t('New conversation')}
          aria-label={t('New conversation')}
          disabled={busy}
          onClick={() => send({ type: 'NewConversation' })}
        >
          <Icon name="plus" size={16} />
        </button>
        <ConversationTools
          conversationId={conversationId}
          hasMessages={hasMessages}
          busy={busy}
          onFind={onFind}
        />
        <button
          className="icon-button"
          title={t('Commands')}
          aria-label={t('Commands')}
          onClick={onPalette}
        >
          <Icon name="command" size={15} />
        </button>
        <button
          className="icon-button"
          title={t('Setup')}
          aria-label={t('Setup')}
          disabled={busy}
          onClick={onSetup}
        >
          <Icon name="help" size={15} />
        </button>
        <button
          className="icon-button"
          title={t('Settings')}
          aria-label={t('Settings')}
          onClick={onPreferences}
        >
          <Icon name="settings" size={15} />
        </button>
      </div>
    </header>
  );
}
