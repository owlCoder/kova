import { spawn } from 'node:child_process';
import type { CancellationToken } from '../../../core/src/common/CancellationToken.js';
import type { ProcessRunner } from '../../../core/src/processes/ProcessRunner.js';

export class NodeProcessRunner implements ProcessRunner {
  constructor(private readonly root: string) {}
  run(
    request: Parameters<ProcessRunner['run']>[0],
    cancellation: CancellationToken,
  ): ReturnType<ProcessRunner['run']> {
    cancellation.throwIfCancellationRequested();
    const max = Math.max(0, Math.min(request.maxOutputCharacters, 30000));
    return new Promise((resolve, reject) => {
      const child = spawn(request.command, request.args ? [...request.args] : [], {
        cwd: request.workingDirectory ?? this.root,
        shell: request.args === undefined,
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '',
        stderr = '',
        omittedCharacters = 0,
        cancelled = false,
        timedOut = false,
        finished = false;
      let grace: ReturnType<typeof setTimeout> | undefined;
      const append = (text: string, stream: 'stdout' | 'stderr') => {
        const room = Math.max(0, max - stdout.length - stderr.length);
        if (stream === 'stdout') stdout += text.slice(0, room);
        else stderr += text.slice(0, room);
        omittedCharacters += Math.max(0, text.length - room);
      };
      const kill = (signal: NodeJS.Signals) => {
        if (!child.pid) return;
        if (process.platform === 'win32') {
          const terminator = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          });
          terminator.on('error', () => {
            child.kill(signal);
          });
        } else {
          try {
            process.kill(-child.pid, signal);
          } catch {
            child.kill(signal);
          }
        }
      };
      const stop = () => {
        kill('SIGTERM');
        grace = setTimeout(() => kill('SIGKILL'), 500);
        grace.unref();
      };
      const timer = setTimeout(
        () => {
          timedOut = true;
          stop();
        },
        Math.max(1, Math.min(request.timeoutMs, 600000)),
      );
      timer.unref();
      const cleanup = () => {
        clearTimeout(timer);
        if (grace) clearTimeout(grace);
        subscription.dispose();
      };
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => append(chunk, 'stdout'));
      child.stderr.on('data', (chunk: string) => append(chunk, 'stderr'));
      child.on('error', (error) => {
        if (finished) return;
        finished = true;
        cleanup();
        reject(error);
      });
      child.on('close', (exitCode) => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve({ exitCode, stdout, stderr, omittedCharacters, cancelled, timedOut });
      });
      const subscription = cancellation.onCancellationRequested(() => {
        cancelled = true;
        stop();
      });
      child.stdin.on('error', () => {
        /* process may exit before input is consumed */
      });
      child.stdin.end(request.stdin ?? '');
    });
  }
}
