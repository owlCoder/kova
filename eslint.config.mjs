import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', '**/dist/**', 'coverage/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'node:*',
                'vscode',
                'react',
                'react/*',
                '@modelcontextprotocol/*',
                '@kova/ollama*',
                '@kova/mcp*',
                '@kova/vscode*',
                '@kova/protocol*',
                '@kova/webview*',
              ],
              message:
                'Core may depend only on its own contracts. Move integration into an adapter.',
            },
          ],
        },
      ],
    },
  },
);
