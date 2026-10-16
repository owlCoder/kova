import type { ProviderConfiguration } from './ProviderConfiguration.js';

export const providerPresets: readonly (ProviderConfiguration & { description: string })[] = [
  {
    kind: 'ollama',
    label: 'Ollama',
    baseUrl: 'http://127.0.0.1:11434',
    model: 'qwen3:4b',
    supportsTools: true,
    discoverModels: true,
    description: 'Local · install and start Ollama first',
  },
  {
    kind: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    supportsTools: true,
    discoverModels: true,
    description: 'Cloud · API key required',
  },
  ...[
    ['OpenAI', 'https://api.openai.com/v1', 'Cloud · Chat Completions models'],
    ['OpenRouter', 'https://openrouter.ai/api/v1', 'Cloud · models from multiple providers'],
    ['Groq', 'https://api.groq.com/openai/v1', 'Cloud · API key required'],
    [
      'Gemini',
      'https://generativelanguage.googleapis.com/v1beta/openai',
      'Cloud · OpenAI-compatible API',
    ],
    ['LM Studio', 'http://127.0.0.1:1234/v1', 'Local · start the LM Studio server first'],
    [
      'Custom provider',
      'http://127.0.0.1:8000/v1',
      'Any OpenAI-compatible Chat Completions endpoint',
    ],
  ].map(([label, baseUrl, description]) => ({
    kind: 'openaiCompatible' as const,
    label: label!,
    baseUrl: baseUrl!,
    description: description!,
    model: '',
    supportsTools: true,
    discoverModels: true,
  })),
];
