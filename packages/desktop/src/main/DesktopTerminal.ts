import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { spawn, type IPty } from 'node-pty';
import type { HostMessage } from '../../../protocol/src/HostMessage.js';

type TerminalMessage = Extract<
  HostMessage,
  { type: 'TerminalOpened' | 'TerminalData' | 'TerminalClosed' }
>;
type Payload = TerminalMessage extends infer M
  ? M extends TerminalMessage
    ? Omit<M, 'protocolVersion' | 'hostSessionId' | 'sequence' | 'workspaceId'>
    : never
  : never;

/** User-operated PTY. It is never exposed as an AI tool and never starts automatically. */
export class DesktopTerminal {
  private current: {
    id: string;
    root: string;
    shell: string;
    process: IPty;
    buffer: string;
    pending: string;
    unacknowledged: number;
    paused: boolean;
  } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly send: (message: Payload) => void) {}

  open(root: string, cols: number, rows: number): void {
    this.syncWorkspace(root);
    if (!this.current) {
      const shell =
        process.platform === 'win32'
          ? 'powershell.exe'
          : process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
      const terminal = spawn(shell, process.platform === 'win32' ? ['-NoLogo'] : ['-l'], {
        name: 'xterm-256color',
        cwd: root,
        cols,
        rows,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          TERM_PROGRAM: 'Kova',
        },
      });
      const current = (this.current = {
        id: randomUUID(),
        root,
        shell: basename(shell),
        process: terminal,
        buffer: '',
        pending: '',
        unacknowledged: 0,
        paused: false as boolean,
      });
      terminal.onData((data) => {
        if (this.current !== current) return;
        current.buffer = (current.buffer + data).slice(-100_000);
        current.pending += data;
        current.unacknowledged += data.length;
        if (current.unacknowledged > 131_072 && !current.paused) {
          current.paused = true;
          terminal.pause();
        }
        if (current.pending.length >= 16_384) this.flush();
        else if (!this.timer) this.timer = setTimeout(() => this.flush(), 16);
      });
      terminal.onExit(({ exitCode }) => {
        if (this.current !== current) return;
        this.flush();
        this.current = null;
        this.send({ type: 'TerminalClosed', terminalId: current.id, exitCode });
      });
    }
    const current = this.current;
    this.flush();
    current.unacknowledged = 0;
    if (current.paused) {
      current.process.resume();
      current.paused = false;
    }
    current.process.resize(cols, rows);
    this.send({
      type: 'TerminalOpened',
      terminalId: current.id,
      root,
      shell: current.shell,
      buffer: current.buffer,
    });
  }
  input(id: string, data: string): void {
    this.require(id).process.write(data);
  }
  resize(id: string, cols: number, rows: number): void {
    this.require(id).process.resize(cols, rows);
  }
  acknowledge(id: string, characters: number): void {
    const current = this.require(id);
    current.unacknowledged = Math.max(0, current.unacknowledged - characters);
    if (current.paused && current.unacknowledged < 32_768) {
      current.paused = false;
      current.process.resume();
    }
  }
  close(id?: string): void {
    if (id && id !== this.current?.id) throw new Error('This terminal is no longer active.');
    const current = this.current;
    this.flush();
    this.current = null;
    if (!current) return;
    try {
      current.process.kill();
    } catch {
      /* The shell may already have exited. */
    }
    this.send({ type: 'TerminalClosed', terminalId: current.id, exitCode: null });
  }
  syncWorkspace(root: string | null): void {
    if (this.current && this.current.root !== root) this.close();
  }
  private require(id: string) {
    if (!this.current || this.current.id !== id)
      throw new Error('This terminal is no longer active.');
    return this.current;
  }
  private flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const current = this.current;
    if (!current) return;
    while (current.pending) {
      const data = current.pending.slice(0, 32_768);
      current.pending = current.pending.slice(data.length);
      this.send({ type: 'TerminalData', terminalId: current.id, data });
    }
  }
}
