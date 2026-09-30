import { build } from 'esbuild';
await build({
  entryPoints: ['tests/smoke/ollama.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/tests/ollama.mjs',
});
await (await import('../dist/tests/ollama.mjs')).run();
