import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18n.js';
import { Icon } from './Icon.js';
import { speechLanguage } from './speechLanguage.js';

interface SpeechTranscript {
  readonly transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechTranscript;
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    readonly [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { readonly error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

type Props = {
  readonly disabled?: boolean;
  onTranscript(text: string): void;
};

/** Microphone button that appends recognized speech to the composer via the Web Speech API. */
export function VoiceInputButton({ disabled, onTranscript }: Props) {
  const { t, language } = useI18n();
  const ctor = speechRecognitionCtor();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  useEffect(
    () => () => {
      recognition.current?.stop();
    },
    [],
  );
  if (!ctor) return null;
  const toggle = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    setError(null);
    const instance = new ctor();
    instance.lang = speechLanguage[language];
    instance.continuous = false;
    instance.interimResults = false;
    instance.onresult = (event) => {
      let text = '';
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        if (result?.isFinal) text += result[0]?.transcript ?? '';
      }
      const trimmed = text.trim();
      if (trimmed) onTranscript(trimmed);
    };
    instance.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed')
        setError(t('Microphone permission denied'));
      else if (event.error && event.error !== 'aborted' && event.error !== 'no-speech')
        setError(t('Voice input failed. Try again.'));
      setListening(false);
    };
    instance.onend = () => setListening(false);
    recognition.current = instance;
    try {
      instance.start();
      setListening(true);
    } catch {
      setError(t('Voice input failed. Try again.'));
    }
  };
  const label = error ?? (listening ? t('Stop listening') : t('Voice input'));
  return (
    <button
      type="button"
      className={`icon-button voice-input${listening ? ' listening' : ''}`}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={listening}
      onClick={toggle}
    >
      <Icon name="mic" size={14} />
    </button>
  );
}
