import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const root = resolve(import.meta.dirname, '../..');
const temp = await mkdtemp(join(tmpdir(), 'kova-desktop-smoke-'));
await mkdir(join(temp, 'project'));
await mkdir(join(temp, 'data/sessions'), { recursive: true });
const project = await realpath(join(temp, 'project'));
await writeFile(join(project, 'note.txt'), 'Before Kova.\n');
await writeFile(
  join(project, 'package.json'),
  JSON.stringify({ name: 'kova-demo-project', version: '1.0.0' }, null, 2),
);
await writeFile(
  join(project, 'AGENTS.md'),
  '# Project rules\nKeep changes focused and preserve file formatting.\n',
);
let chats = 0;
const server = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/api/tags') {
    response.end(
      JSON.stringify({
        models: [
          {
            name: 'qwen3:4b',
            size: 2_000_000_000,
            capabilities: ['tools', 'thinking'],
            details: { context_length: 32768 },
          },
          {
            name: 'qwen3-coder:7b',
            size: 4_000_000_000,
            capabilities: ['tools'],
            details: { context_length: 65536 },
          },
          {
            name: 'llama3:8b',
            size: 5_000_000_000,
            capabilities: [],
            details: { context_length: 32768 },
          },
        ],
      }),
    );
    return;
  }
  if (request.url !== '/api/chat') {
    response.writeHead(404);
    response.end('{}');
    return;
  }
  let text = '';
  for await (const chunk of request) text += chunk;
  const body = JSON.parse(text);
  chats++;
  const prompt = body.messages.findLast((message) => message.role === 'user')?.content ?? '';
  response.setHeader('Content-Type', 'application/x-ndjson');
  const emit = (record) => response.write(JSON.stringify(record) + '\n');
  const finished = () =>
    response.end(JSON.stringify({ done: true, prompt_eval_count: 180, eval_count: 55 }) + '\n');
  if (
    /update|edit|change note/i.test(prompt) &&
    !body.messages.some((message) => message.role === 'tool')
  ) {
    emit({
      message: {
        content: 'I’ll make a focused update to `note.txt`. Please review the proposed change.',
        tool_calls: [
          {
            function: {
              name: 'edit_file',
              arguments: {
                path: 'note.txt',
                old_string: 'Before Kova.\n',
                new_string: 'After Kova.\n',
              },
            },
          },
        ],
      },
    });
    finished();
    return;
  }
  const answer = /update|edit|change note/i.test(prompt)
    ? '### Update complete\n\n`note.txt` now contains **After Kova.**\n\nThe change was applied through the shared approval pipeline. You can inspect the file in the project panel.'
    : '### A workspace that stays yours\n\nThis is a **local test response** from the desktop smoke endpoint. Kova is connected to the shared agent runtime.\n\n- Open files in the project panel\n- Attach context before a request\n- Review proposed changes before approval\n\n```typescript\nexport const ready = true;\n```\n\n| Capability | Status |\n| --- | --- |\n| Streaming | Ready |\n| Local history | Ready |\n| Tool approvals | Ready |';
  const pieces = answer.match(/.{1,16}/gs) ?? [];
  let index = 0;
  const timer = setInterval(() => {
    if (/long|cancel|stop test/i.test(prompt))
      emit({ message: { content: 'Still working on this cancellable test… ' } });
    else if (index < pieces.length) emit({ message: { content: pieces[index++] } });
    else {
      clearInterval(timer);
      finished();
    }
  }, 45);
  response.on('close', () => clearInterval(timer));
});
await new Promise((resolve, reject) => {
  server.on('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const port = server.address().port;
const id = randomUUID();
const history = process.argv.includes('--history');
const entries = history
  ? Array.from({ length: 120 }, (_, index) => ({
      id: `history-${index}`,
      turnId: `history-turn-${Math.floor(index / 2)}`,
      stepId: null,
      message: {
        role: index % 2 ? 'assistant' : 'user',
        content:
          index === 0
            ? 'Opening history marker: ARCHIVE_NEEDLE. This message starts outside the initial rendered window.'
            : index % 2
              ? `### History answer ${index}\n\nA saved explanation with **Markdown** and a short example.\n\n\`\`\`typescript\nexport const example${index} = true;\n\`\`\``
              : `History prompt ${index}: explain this part of the example project.`,
      },
      toolResultOrigin: null,
      omitted: false,
    }))
  : [];
if (history)
  await writeFile(join(project, 'large-context.txt'), 'Captured context sample.\n'.repeat(3000));
await writeFile(
  join(temp, 'data/settings.json'),
  JSON.stringify({
    provider: {
      kind: 'ollama',
      label: 'Ollama · local test',
      baseUrl: `http://127.0.0.1:${port}`,
      model: 'qwen3:4b',
      supportsTools: true,
      discoverModels: true,
    },
    theme: 'dark',
    setupCompleted: true,
    lastConversationId: id,
    recentWorkspaces: [project],
  }),
);
await writeFile(
  join(temp, 'data/sessions', id + '.json'),
  JSON.stringify({
    conversation: { id, workspaceId: project, entries, summary: null },
    title: history ? 'Long conversation fixture' : 'New session',
    updatedAt: new Date().toISOString(),
    archived: false,
  }),
);
console.log(`Desktop smoke project: ${project}`);
console.log(
  'Use the native UI: send a message; ask to update note.txt; inspect and approve; test stop; close the app when finished. No external AI calls.',
);
const require = createRequire(import.meta.url);
const appPath = process.argv.find((argument) => argument.startsWith('--app='))?.slice(6);
const child = spawn(
  appPath ?? require('electron'),
  appPath ? [] : [resolve(root, 'dist/desktop')],
  {
    stdio: 'inherit',
    env: { ...process.env, KOVA_DESKTOP_DATA: join(temp, 'data') },
  },
);
const signal = () => child.kill('SIGTERM');
process.on('SIGINT', signal);
process.on('SIGTERM', signal);
try {
  const code = await new Promise((resolve) => child.once('exit', (code) => resolve(code ?? 1)));
  const settings = JSON.parse(await readFile(join(temp, 'data/settings.json'), 'utf8'));
  const updated = (await readFile(join(project, 'note.txt'), 'utf8')) === 'After Kova.\n';
  console.log(
    `Desktop smoke finished: exit=${code}; chat requests=${chats}; approved edit=${updated}; persisted session=${Boolean(settings.lastConversationId)}.`,
  );
  if (process.argv.includes('--interface-only')) {
    const terminalFile = await readFile(join(project, 'terminal-smoke.txt'), 'utf8').catch(
      () => '',
    );
    const passed =
      terminalFile === 'KOVA_TERMINAL_OK' &&
      settings.language === 'sr' &&
      settings.textSize === 'large' &&
      code === 0;
    console.log(
      `Interface smoke: terminal=${terminalFile === 'KOVA_TERMINAL_OK'}; language=${settings.language}; textSize=${settings.textSize}; passed=${passed}`,
    );
    if (!passed) process.exitCode = 1;
  } else if (process.argv.includes('--verify') && (!updated || chats < 2 || code !== 0))
    process.exitCode = 1;
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(temp, { recursive: true, force: true });
}
