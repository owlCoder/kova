import { describe, expect, it } from 'vitest';
import { highlightTokens } from '../../webview/src/components/syntaxHighlight.js';

describe('syntax highlighting', () => {
  it('tokenizes C# into keywords, types, strings and comments without losing text', () => {
    const code = [
      '// a comment',
      'public class User',
      '{',
      '    public string Name { get; set; } = "Ana";',
      '}',
    ].join('\n');
    const tokens = highlightTokens(code, 'csharp');
    // Token texts always concatenate back to the exact input (no HTML, no loss).
    expect(tokens.map((token) => token.text).join('')).toBe(code);
    const kinds = new Set(tokens.map((token) => token.kind));
    expect(kinds.has('comment')).toBe(true);
    expect(kinds.has('keyword')).toBe(true);
    expect(kinds.has('type')).toBe(true);
    expect(kinds.has('string')).toBe(true);
    expect(tokens.find((token) => token.text === 'class')?.kind).toBe('keyword');
    expect(tokens.find((token) => token.text === 'User')?.kind).toBe('type');
    expect(tokens.find((token) => token.text === '"Ana"')?.kind).toBe('string');
    expect(tokens.find((token) => token.text === '// a comment')?.kind).toBe('comment');
  });

  it('highlights TypeScript template strings, numbers and function calls', () => {
    const code = 'const n = 42;\nconsole.log(`hi ${n}`);';
    const tokens = highlightTokens(code, 'ts');
    expect(tokens.map((token) => token.text).join('')).toBe(code);
    expect(tokens.find((token) => token.text === 'const')?.kind).toBe('keyword');
    expect(tokens.find((token) => token.text === '42')?.kind).toBe('number');
    expect(tokens.find((token) => token.text.startsWith('`hi'))?.kind).toBe('string');
    expect(tokens.find((token) => token.text === 'log')?.kind).toBe('func');
  });

  it('marks diff lines and JSON keys, and leaves unknown languages plain', () => {
    const diff = highlightTokens('@@ -1 +1 @@\n-old\n+new', 'diff');
    expect(diff.find((token) => token.text.startsWith('@@'))?.kind).toBe('meta');
    expect(diff.find((token) => token.text === '+new')?.kind).toBe('add');
    expect(diff.find((token) => token.text === '-old')?.kind).toBe('del');
    const json = highlightTokens('{"name": "kova", "ok": true}', 'json');
    expect(json.find((token) => token.text === '"name"')?.kind).toBe('attr');
    expect(json.find((token) => token.text === 'true')?.kind).toBe('keyword');
    expect(highlightTokens('plain text', 'brainfuck')).toEqual([
      { text: 'plain text', kind: 'plain' },
    ]);
  });

  it('highlights Rust, Go and Java with keywords, types, funcs and numbers', () => {
    const rust = highlightTokens('fn main() { let count = 42; }', 'rust');
    expect(rust.map((t) => t.text).join('')).toBe('fn main() { let count = 42; }');
    expect(rust.find((t) => t.text === 'fn')?.kind).toBe('keyword');
    expect(rust.find((t) => t.text === 'main')?.kind).toBe('func');
    expect(rust.find((t) => t.text === '42')?.kind).toBe('number');
    const go = highlightTokens('package main\nfunc Add(a int) int { return a }', 'go');
    expect(go.find((t) => t.text === 'package')?.kind).toBe('keyword');
    expect(go.find((t) => t.text === 'int')?.kind).toBe('keyword');
    const java = highlightTokens('public class User { String name; }', 'java');
    expect(java.find((t) => t.text === 'class')?.kind).toBe('keyword');
    expect(java.find((t) => t.text === 'User')?.kind).toBe('type');
    expect(java.find((t) => t.text === 'String')?.kind).toBe('type');
  });

  it('marks C preprocessor lines as meta and PHP variables as attr', () => {
    const c = highlightTokens('#include <stdio.h>\nint main(void) { return 0; }', 'c');
    expect(c.map((t) => t.text).join('')).toContain('#include <stdio.h>');
    expect(c.find((t) => t.text === '#include <stdio.h>')?.kind).toBe('meta');
    const php = highlightTokens('<?php $name = "kova";', 'php');
    expect(php.find((t) => t.text === '$name')?.kind).toBe('attr');
    expect(php.find((t) => t.text === '"kova"')?.kind).toBe('string');
  });

  it('highlights CSS at-rules, declarations and colors', () => {
    const css = highlightTokens('@media (min-width: 600px) {\n  color: #fff;\n}', 'css');
    expect(css.map((t) => t.text).join('')).toBe('@media (min-width: 600px) {\n  color: #fff;\n}');
    expect(css.find((t) => t.text === '@media')?.kind).toBe('keyword');
    expect(css.find((t) => t.text === 'color')?.kind).toBe('attr');
    expect(css.find((t) => t.text === '#fff')?.kind).toBe('number');
  });

  it('keeps HTML-looking content as inert text tokens', () => {
    const code = '<script>alert(1)</script>';
    const tokens = highlightTokens(code, 'html');
    // Tokens are plain data rendered as React text spans, never markup:
    // they always concatenate back to the exact input.
    expect(tokens.map((token) => token.text).join('')).toBe(code);
    expect(tokens.find((token) => token.text === '<script>')?.kind).toBe('tag');
  });
});
