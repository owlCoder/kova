import type { SessionSnapshot } from '../../../packages/protocol/src/SessionSnapshot.js';
import { send } from '../messaging/bridge.js';
import { useI18n } from '../i18n/I18n.js';
import { Icon } from './Icon.js';

/** Connection problem above the composer, as wide as the input, with fixes. */
export function ProviderBanner({
  snapshot,
  issue,
  busy,
}: {
  snapshot: SessionSnapshot;
  issue: string;
  busy: boolean;
}) {
  const { t } = useI18n();
  const missingModel = snapshot.providerStatus === 'ModelMissing';
  return (
    <div
      className={`provider-banner ${missingModel ? 'banner-warning' : 'banner-error'}`}
      role="alert"
    >
      <Icon name={missingModel ? 'cpu' : 'warning'} size={16} />
      <div className="banner-copy">
        <strong>
          {missingModel
            ? t('Choose an available model')
            : t('Kova can’t reach {provider}', { provider: snapshot.providerLabel })}
        </strong>
        <small>
          {missingModel
            ? t('The selected model is not offered by this provider.')
            : t('Check the endpoint and API key, then try again.')}
          {issue && !missingModel && (
            <span className="banner-detail" title={issue}>
              {' '}
              {issue}
            </span>
          )}
        </small>
      </div>
      <div className="banner-actions">
        {!missingModel && (
          <button disabled={busy} onClick={() => send({ type: 'RetryProvider' })}>
            <Icon name="refresh" size={13} />
            {t('Retry')}
          </button>
        )}
        <button
          className="primary"
          disabled={busy}
          onClick={() => send({ type: 'OpenProviderSetup' })}
        >
          {missingModel ? t('Choose model') : t('Set up provider')}
        </button>
      </div>
    </div>
  );
}
