import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  const message = JSON.parse(line);
  if (!('id' in message)) continue;
  let result;
  if (message.method === 'initialize')
    result = {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'fixture', version: '1' },
    };
  else if (message.method === 'ping') result = {};
  else if (message.method === 'tools/list')
    result = {
      tools: [
        {
          name: 'echo',
          description: 'Fixture echo',
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
          annotations: { readOnlyHint: true },
        },
        {
          name: 'fail',
          description: 'Fixture fail',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    };
  if (
    message.method === 'tools/list' &&
    process.argv[2] === 'dynamic' &&
    existsSync(process.argv[3])
  )
    result.tools.push({
      name: readFileSync(process.argv[3], 'utf8'),
      inputSchema: { type: 'object', properties: {} },
    });
  if (message.method === 'tools/list' && process.argv[2] === 'overflow')
    result.tools = Array.from({ length: 65 }, (_, index) => ({
      name: `tool${index}`,
      inputSchema: { type: 'object', properties: {} },
    }));
  if (message.method === 'tools/call')
    result = {
      content: [
        {
          type: 'text',
          text: message.params.name === 'fail' ? 'fixture failure' : message.params.arguments.text,
        },
      ],
      ...(message.params.name === 'fail' ? { isError: true } : {}),
    };
  else if (!result) {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: 'Unknown method' },
      }) + '\n',
    );
    continue;
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\n');
}
