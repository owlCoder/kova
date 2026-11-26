import { useEffect, useState } from 'react';
import type { AgentState } from '../../../packages/protocol/src/AgentState.js';
import { useI18n } from '../i18n/I18n.js';

const frames = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];

const phrase: Partial<Record<AgentState, string>> = {
  BuildingContext: 'Gathering context',
  Streaming: 'Writing',
  ValidatingTool: 'Checking the tool call',
  PreparingTool: 'Preparing',
  EvaluatingPolicy: 'Checking permissions',
  RunningPreHooks: 'Running hooks',
  EvaluatingGuardrails: 'Checking guardrails',
  AwaitingApproval: 'Waiting for your approval',
  ExecutingTool: 'Working',
  RunningPostHooks: 'Running hooks',
  RecordingToolResult: 'Reading the result',
};

/** Animated status line under the transcript while a run is active. */
export function WorkingIndicator({
  state,
  startedAt,
}: {
  state: AgentState;
  startedAt: number | null;
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), reduced ? 1000 : 120);
    return () => clearInterval(timer);
  }, [reduced]);
  const seconds = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const frame = reduced ? '✻' : frames[Math.floor(now / 120) % frames.length];
  return (
    <div className="working-indicator" role="status" aria-live="polite">
      <span className="working-glyph" aria-hidden="true">
        {frame}
      </span>
      <span className="working-text">{t(phrase[state] ?? 'Thinking')}…</span>
      <span className="working-meta">
        ({seconds}s · {t('Esc to interrupt')})
      </span>
    </div>
  );
}
