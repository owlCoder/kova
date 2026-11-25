/**
 * Tiny regex tokenizer for generated code blocks. It returns plain text
 * tokens that React renders as spans, so no innerHTML or remote script is
 * ever involved (webview CSP). Unknown languages highlight nothing.
 */
export type TokenKind =
  | 'plain'
  | 'comment'
  | 'string'
  | 'number'
  | 'keyword'
  | 'type'
  | 'func'
  | 'attr'
  | 'tag'
  | 'add'
  | 'del'
  | 'meta';

export interface Token {
  readonly text: string;
  readonly kind: TokenKind;
}

const C_LINE_COMMENT = String.raw`//[^\n]*`;
const BLOCK_COMMENT = String.raw`/\*[\s\S]*?\*/`;
const HASH_COMMENT = String.raw`#[^\n]*`;
const SQL_LINE_COMMENT = String.raw`--[^\n]*`;
const HTML_COMMENT = String.raw`<!--[\s\S]*?-->`;

const STRINGS =
  String.raw`(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|` +
  '`(?:[^`\\\\]|\\\\.)*`' +
  String.raw`|@"(?:[^"]|"")*"|\$"(?:[^"\\]|\\.)*")`;
const PY_STRINGS = String.raw`(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')`;
const NUMBERS = String.raw`\b(?:0[xX][0-9a-fA-F_]+|\d[\d_]*(?:\.\d[\d_]*)?)\b`;
const IDENT_FUNC = String.raw`[A-Za-z_]\w*(?=\s*\()`;
const TYPE_NAME = String.raw`\b[A-Z][A-Za-z0-9_]*\b`;

interface LanguageSpec {
  readonly comments: readonly string[];
  readonly strings: string;
  readonly keywords: readonly string[];
  readonly types?: boolean;
  readonly sqlCaseVariants?: boolean;
}

const CSHARP: LanguageSpec = {
  comments: [C_LINE_COMMENT, BLOCK_COMMENT],
  strings: STRINGS,
  keywords:
    'using namespace public private protected internal class struct interface enum record void string int long bool double float decimal byte char object var new this base null true false if else for foreach while do switch case break continue return try catch finally throw in out ref params async await get set add remove static readonly const virtual override abstract sealed partial lock fixed unsafe yield event delegate when is as typeof nameof sizeof default checked unchecked stackalloc volatile extern alias global init only required file scoped'.split(
      ' ',
    ),
  types: true,
};

const JS: LanguageSpec = {
  comments: [C_LINE_COMMENT, BLOCK_COMMENT],
  strings: STRINGS,
  keywords:
    'import export from default const let var function return if else for while do switch case break continue class interface extends implements type of new delete typeof instanceof in async await yield try catch finally throw this super null undefined true false as satisfies keyof readonly public private protected static abstract get set declare namespace module require'.split(
      ' ',
    ),
  types: true,
};

const PYTHON: LanguageSpec = {
  comments: [HASH_COMMENT],
  strings: PY_STRINGS,
  keywords:
    'def class return if elif else for while import from as with try except finally raise pass lambda global nonlocal assert yield async await True False None self print is not and or in del'.split(
      ' ',
    ),
};

const BASH: LanguageSpec = {
  comments: [HASH_COMMENT],
  strings: STRINGS,
  keywords:
    'if then else elif fi for while do done case esac function in echo cd export local return exit set unset shift trap readonly source test eval exec let select until'.split(
      ' ',
    ),
};

const SQL: LanguageSpec = {
  comments: [SQL_LINE_COMMENT, BLOCK_COMMENT],
  strings: STRINGS,
  keywords:
    'select from where insert into values update set delete create table alter drop index join inner left right full outer on group by order having limit offset as distinct union all primary key foreign references not null and or like between in exists case when then else end begin commit rollback'.split(
      ' ',
    ),
  sqlCaseVariants: true,
};

const SPECS: Readonly<Record<string, LanguageSpec>> = {
  csharp: CSHARP,
  cs: CSHARP,
  'c#': CSHARP,
  ts: JS,
  tsx: JS,
  js: JS,
  jsx: JS,
  mjs: JS,
  cjs: JS,
  json: { comments: [], strings: STRINGS, keywords: ['true', 'false', 'null'] },
  python: PYTHON,
  py: PYTHON,
  bash: BASH,
  sh: BASH,
  shell: BASH,
  zsh: BASH,
  sql: SQL,
  yaml: {
    comments: [HASH_COMMENT],
    strings: STRINGS,
    keywords: ['true', 'false', 'null', 'yes', 'no', 'on', 'off'],
  },
  yml: {
    comments: [HASH_COMMENT],
    strings: STRINGS,
    keywords: ['true', 'false', 'null', 'yes', 'no', 'on', 'off'],
  },
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildPattern(language: string): RegExp | null {
  const lang = language.toLowerCase().replace(/^language-/, '');
  if (lang === 'diff' || lang === 'patch')
    return new RegExp(
      String.raw`^(?<meta>@@[^@\n]*@@[^\n]*)|^(?<add>\+[^\n]*)|^(?<del>-[^\n]*)`,
      'gm',
    );
  if (lang === 'xml' || lang === 'html' || lang === 'xaml' || lang === 'svg')
    return new RegExp(
      String.raw`(?<comment>${HTML_COMMENT})|(?<tag><\/?[A-Za-z][^>\n]*>|\/?>)|(?<string>${STRINGS})`,
      'g',
    );
  if (lang === 'json')
    return new RegExp(
      String.raw`(?<attr>"(?:[^"\\\n]|\\.)*"(?=\s*:))|(?<string>${STRINGS})|(?<keyword>\b(?:true|false|null)\b)|(?<number>${NUMBERS})`,
      'g',
    );
  if (lang === 'yaml' || lang === 'yml')
    return new RegExp(
      String.raw`(?<comment>${HASH_COMMENT})|(?<attr>^\s*[\w.-]+(?=\s*:))|(?<string>${STRINGS})|(?<keyword>\b(?:true|false|null|yes|no|on|off)\b)|(?<number>${NUMBERS})`,
      'gm',
    );
  const spec = SPECS[lang];
  if (!spec) return null;
  const keywords = spec.sqlCaseVariants
    ? spec.keywords.flatMap((word) => [word, word.toUpperCase()])
    : spec.keywords;
  const parts = [
    spec.comments.length ? `(?<comment>${spec.comments.join('|')})` : null,
    `(?<string>${spec.strings})`,
    `(?<keyword>\\b(?:${keywords.map(escapeRegExp).join('|')})\\b)`,
    `(?<number>${NUMBERS})`,
    spec.types ? `(?<type>${TYPE_NAME})` : null,
    `(?<func>${IDENT_FUNC})`,
  ].filter(Boolean);
  return new RegExp(parts.join('|'), 'g');
}

const KINDS: readonly string[] = [
  'comment',
  'string',
  'number',
  'keyword',
  'type',
  'func',
  'attr',
  'tag',
  'add',
  'del',
  'meta',
];

/** Splits code into styled tokens; concatenating all token texts returns the input. */
export function highlightTokens(code: string, language: string): Token[] {
  const pattern = buildPattern(language);
  if (!pattern) return [{ text: code, kind: 'plain' }];
  const tokens: Token[] = [];
  let last = 0;
  for (const match of code.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push({ text: code.slice(last, index), kind: 'plain' });
    const groups = match.groups ?? {};
    const kind = (KINDS.find((name) => groups[name] !== undefined) ?? 'plain') as TokenKind;
    tokens.push({ text: match[0], kind });
    last = index + match[0].length;
  }
  if (last < code.length) tokens.push({ text: code.slice(last), kind: 'plain' });
  return tokens;
}
