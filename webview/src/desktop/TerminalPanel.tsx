import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { send, subscribe } from '../messaging/bridge.js';
import { Icon } from '../components/Icon.js';
import { useI18n } from '../i18n/I18n.js';

function readTerminalTheme(element: Element) {
  const palette = getComputedStyle(element);
  const color = (token: string) => palette.getPropertyValue(token).trim();
  return {
    background: color('--terminal-background'),
    foreground: color('--text'),
    cursor: color('--accent'),
    selectionBackground: color('--selection'),
    black: color('--sidebar'),
    red: color('--red'),
    green: color('--green'),
    yellow: color('--accent'),
    blue: color('--blue'),
    magenta: '#c5a4cf',
    cyan: '#8bc6c2',
    white: color('--text'),
  };
}

export default function TerminalPanel({
  root,
  visible,
  textSize,
  theme,
  onHide,
}: {
  root: string | null;
  visible: boolean;
  textSize: string;
  theme: string;
  onHide(): void;
}) {
  const { t, language } = useI18n();
  const translation = useRef(t);
  translation.current = t;
  const container = useRef<HTMLDivElement>(null);
  const current = useRef<{
    term: Terminal;
    fit: FitAddon;
    id: string | null;
    request: string;
    shell: string;
  } | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const [status, setStatus] = useState<'opening' | 'ready' | 'exited' | 'error'>('opening');
  const [shell, setShell] = useState('');
  const [height, setHeight] = useState(300);
  const dragging = useRef<{ y: number; height: number } | null>(null);
  const restart = () => {
    const active = current.current;
    if (!active || !root) return;
    if (active.id) send({ type: 'CloseTerminal', terminalId: active.id });
    active.id = null;
    active.term.reset();
    setStatus('opening');
    active.fit.fit();
    active.request = send({ type: 'OpenTerminal', cols: active.term.cols, rows: active.term.rows });
  };
  useEffect(() => {
    if (!container.current) return;
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      lineHeight: 1.25,
      fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
      scrollback: 3000,
      screenReaderMode: true,
      allowProposedApi: false,
      theme: readTerminalTheme(container.current),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container.current);
    const state = (current.current = {
      term,
      fit,
      id: null as string | null,
      request: '',
      shell: '',
    });
    const input = term.onData((data) => {
      if (state.id)
        for (let offset = 0; offset < data.length; offset += 16_384)
          send({
            type: 'TerminalInput',
            terminalId: state.id,
            data: data.slice(offset, offset + 16_384),
          });
    });
    term.attachCustomKeyEventHandler(
      (event) =>
        !(
          event.type === 'keydown' &&
          ((event.ctrlKey && event.code === 'Backquote') ||
            ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'KeyT'))
        ),
    );
    const fitTerminal = () => {
      if (!visibleRef.current || !container.current?.clientWidth) return;
      fit.fit();
      if (state.id)
        send({ type: 'ResizeTerminal', terminalId: state.id, cols: term.cols, rows: term.rows });
    };
    const observer = new ResizeObserver(fitTerminal);
    observer.observe(container.current);
    const unsubscribe = subscribe((message) => {
      if (message.type === 'TerminalOpened') {
        state.id = message.terminalId;
        state.shell = message.shell;
        setShell(message.shell);
        setStatus('ready');
        term.reset();
        term.write(message.buffer);
        fitTerminal();
        if (visibleRef.current) term.focus();
      } else if (message.type === 'TerminalData' && state.id === message.terminalId) {
        term.write(message.data, () => {
          if (state.id === message.terminalId)
            send({
              type: 'TerminalAck',
              terminalId: message.terminalId,
              characters: message.data.length,
            });
        });
      } else if (message.type === 'TerminalClosed' && state.id === message.terminalId) {
        state.id = null;
        setStatus('exited');
        term.writeln(
          `\r\n[${message.exitCode === null ? translation.current('Terminal closed') : translation.current('Process exited with code {code}', { code: message.exitCode })}]`,
        );
      } else if (message.type === 'Rejected' && message.requestId === state.request) {
        setStatus('error');
        term.writeln(`\r\n${message.message}`);
      }
    });
    return () => {
      input.dispose();
      unsubscribe();
      observer.disconnect();
      term.dispose();
      current.current = null;
    };
  }, []);
  useEffect(() => {
    const state = current.current;
    if (!state) return;
    state.id = null;
    state.term.reset();
    setStatus('opening');
  }, [root]);
  useEffect(() => {
    const state = current.current;
    if (!state || !visible || !root) return;
    const frame = requestAnimationFrame(() => {
      state.fit.fit();
      if (!state.id) {
        setStatus('opening');
        state.request = send({
          type: 'OpenTerminal',
          cols: state.term.cols,
          rows: state.term.rows,
        });
      } else
        send({
          type: 'ResizeTerminal',
          terminalId: state.id,
          cols: state.term.cols,
          rows: state.term.rows,
        });
      state.term.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, root]);
  useEffect(() => {
    const active = current.current;
    if (!active) return;
    active.term.options.fontSize = textSize === 'larger' ? 17 : textSize === 'large' ? 16 : 14;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      active.term.options.theme = readTerminalTheme(container.current ?? document.documentElement);
      if (visibleRef.current) active.fit.fit();
    };
    // The workspace theme effect updates the root first; use its resolved CSS tokens.
    let frame = requestAnimationFrame(apply);
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };
    media.addEventListener('change', update);
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener('change', update);
    };
  }, [theme, textSize]);
  useEffect(() => {
    current.current?.term.textarea?.setAttribute('aria-label', t('Terminal input'));
  }, [language]);
  return (
    <section
      className="terminal-panel"
      aria-label={t('Project terminal')}
      style={{ height: `min(${height}px, 65vh)`, display: visible ? 'flex' : 'none' }}
    >
      <div
        className="terminal-resizer"
        role="separator"
        aria-label={t('Resize terminal')}
        aria-orientation="horizontal"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            setHeight((value) =>
              Math.max(
                180,
                Math.min(window.innerHeight * 0.65, value + (event.key === 'ArrowUp' ? 30 : -30)),
              ),
            );
          }
        }}
        onPointerDown={(event) => {
          dragging.current = { y: event.clientY, height };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (dragging.current)
            setHeight(
              Math.max(
                180,
                Math.min(
                  window.innerHeight * 0.65,
                  dragging.current.height + dragging.current.y - event.clientY,
                ),
              ),
            );
        }}
        onPointerUp={() => {
          dragging.current = null;
        }}
      />
      <header>
        <div className="terminal-tab">
          <Icon name="terminal" size={16} />
          <strong>{t('Terminal')}</strong>
          <span>{shell || t('Local shell')}</span>
          <i className={`status-dot ${status === 'ready' ? 'online' : ''}`} />
        </div>
        <div className="terminal-actions">
          <button
            disabled={!root}
            title={t('New terminal')}
            aria-label={t('New terminal')}
            onClick={restart}
          >
            <Icon name="plus" size={16} />
          </button>
          <button
            title={t('Clear terminal')}
            aria-label={t('Clear terminal')}
            onClick={() => current.current?.term.clear()}
          >
            <Icon name="refresh" size={15} />
          </button>
          <button
            disabled={status !== 'ready'}
            title={t('Interrupt command')}
            aria-label={t('Interrupt command')}
            onClick={() => {
              const id = current.current?.id;
              if (id) send({ type: 'TerminalInput', terminalId: id, data: '\u0003' });
            }}
          >
            <Icon name="stop" size={13} />
          </button>
          <button title={t('Hide terminal')} aria-label={t('Hide terminal')} onClick={onHide}>
            <Icon name="down" size={16} />
          </button>
          <button
            title={t('Close terminal')}
            aria-label={t('Close terminal')}
            onClick={() => {
              const id = current.current?.id;
              if (id) send({ type: 'CloseTerminal', terminalId: id });
              onHide();
            }}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </header>
      <div className="terminal-location">
        <Icon name="folder" size={13} />
        <span title={root ?? ''}>{root ?? t('Open a project to use the terminal')}</span>
        <span>{t('User-operated CLI')}</span>
      </div>
      <div className="terminal-surface" ref={container} />
      {!root && (
        <div className="terminal-empty">
          <p>{t('Open a project to start an interactive shell.')}</p>
          <button onClick={() => send({ type: 'OpenWorkspace' })}>{t('Open project')}</button>
        </div>
      )}
      {(status === 'exited' || status === 'error') && root && (
        <button className="terminal-restart" onClick={restart}>
          {t('Restart terminal')}
        </button>
      )}
    </section>
  );
}
