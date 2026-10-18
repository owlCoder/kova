import { chmod, mkdtemp, realpath, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { stripVTControlCharacters } from 'node:util';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopTerminal } from '../../packages/desktop/src/main/DesktopTerminal.js';

let root: string;
let terminal: DesktopTerminal;
let messages: Parameters<ConstructorParameters<typeof DesktopTerminal>[0]>[0][];
beforeAll(async () => {
  if (process.platform === 'darwin') {
    const folder = dirname(createRequire(import.meta.url).resolve('node-pty/package.json'));
    await chmod(
      join(folder, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
      0o755,
    );
  }
});
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'kova-pty-')));
  messages = [];
  terminal = new DesktopTerminal((message) => {
    messages.push(message);
    if (message.type === 'TerminalData')
      terminal.acknowledge(message.terminalId, message.data.length);
  });
});
afterEach(async () => {
  terminal.close();
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});
const output = () =>
  stripVTControlCharacters(
    messages
      .filter((message) => message.type === 'TerminalData')
      .map((message) => message.data)
      .join(''),
  ).replaceAll('\r', '');

/** PowerShell cold startup on a shared Windows runner can outlast the command assertion. */
async function openTerminal(cols: number, rows: number) {
  terminal.open(root, cols, rows);
  const opened = messages.find((message) => message.type === 'TerminalOpened');
  if (!opened || opened.type !== 'TerminalOpened') throw new Error('Terminal did not open');
  if (process.platform === 'win32')
    await vi.waitFor(() => expect(output()).toMatch(/PS [^\r\n]+>/), { timeout: 15_000 });
  return opened;
}

describe('user-operated desktop PTY', () => {
  it(
    'reports a natural shell exit and can open a fresh terminal afterward',
    { timeout: 30_000 },
    async () => {
      const opened = await openTerminal(80, 24);
      terminal.input(opened.terminalId, 'exit\r');
      await vi.waitFor(
        () =>
          expect(messages).toContainEqual({
            type: 'TerminalClosed',
            terminalId: opened.terminalId,
            exitCode: 0,
          }),
        { timeout: 7000 },
      );
      expect(() => terminal.input(opened.terminalId, 'echo stale\r')).toThrow('no longer active');
      terminal.open(root, 80, 24);
      const next = messages.filter((message) => message.type === 'TerminalOpened').at(-1)!;
      expect(next.terminalId).not.toBe(opened.terminalId);
    },
  );

  it(
    'runs a real interactive shell in the project, supports resize and reattaches without a new process',
    { timeout: 30_000 },
    async () => {
      const opened = await openTerminal(80, 24);
      terminal.input(
        opened.terminalId,
        "node -e \"console.log('PTY_CWD:'+process.cwd());console.log('PTY_TTY:'+process.stdout.isTTY)\"\r",
      );
      await vi.waitFor(() => expect(output()).toContain('PTY_TTY:true'), { timeout: 7000 });
      expect(output()).toContain(`PTY_CWD:${root}`);
      terminal.resize(opened.terminalId, 100, 30);
      terminal.input(
        opened.terminalId,
        "node -e \"console.log('PTY_SIZE:'+process.stdout.columns+':'+process.stdout.rows)\"\r",
      );
      await vi.waitFor(() => expect(output()).toContain('PTY_SIZE:100:30'), { timeout: 7000 });
      terminal.open(root, 90, 28);
      const replay = messages.filter((message) => message.type === 'TerminalOpened').at(-1);
      expect(replay?.terminalId).toBe(opened.terminalId);
      expect(replay?.buffer).toContain('PTY_TTY:true');
      terminal.syncWorkspace(null);
      expect(() => terminal.input(opened.terminalId, 'echo stale\r')).toThrow('no longer active');
    },
  );

  it(
    'honors Ctrl+C without killing the shell and closes it on project changes',
    { timeout: 40_000 },
    async () => {
      const opened = await openTerminal(100, 30);
      terminal.input(
        opened.terminalId,
        "node -e \"setInterval(()=>require('fs').writeFileSync('pty-running','ready'),100)\"\r",
      );
      await vi.waitFor(
        async () => expect(await readFile(join(root, 'pty-running'), 'utf8')).toBe('ready'),
        { timeout: 7000 },
      );
      const beforeInterrupt = output().length;
      terminal.input(opened.terminalId, '\u0003');
      // PowerShell clears queued input while handling Ctrl+C; wait for its new prompt.
      if (process.platform === 'win32')
        await vi.waitFor(() => expect(output().slice(beforeInterrupt)).toMatch(/PS [^\r\n]+>/), {
          timeout: 7000,
        });
      terminal.input(
        opened.terminalId,
        "node -e \"require('fs').writeFileSync('pty-alive','after-interrupt')\"\r",
      );
      await vi.waitFor(
        async () => expect(await readFile(join(root, 'pty-alive'), 'utf8')).toBe('after-interrupt'),
        { timeout: 7000 },
      );
      terminal.syncWorkspace(root + '-different');
      expect(
        messages.some(
          (message) =>
            message.type === 'TerminalClosed' && message.terminalId === opened.terminalId,
        ),
      ).toBe(true);
      expect(() => terminal.resize(opened.terminalId, 80, 24)).toThrow();
    },
  );
});
