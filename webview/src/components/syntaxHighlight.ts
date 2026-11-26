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
  readonly preprocessor?: boolean;
  readonly variables?: boolean;
  readonly symbols?: boolean;
  readonly decls?: boolean;
  readonly atRules?: boolean;
  readonly colors?: boolean;
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

const C_COMMENTS = [C_LINE_COMMENT, BLOCK_COMMENT];

const RUST: LanguageSpec = {
  comments: C_COMMENTS,
  strings: STRINGS + String.raw`|r#*"[^"]*"#*`,
  keywords:
    'as async await box break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while'.split(
      ' ',
    ),
  types: true,
};

const GO: LanguageSpec = {
  comments: C_COMMENTS,
  strings: STRINGS,
  keywords:
    'any bool break byte case chan complex64 complex128 comparable const continue default defer else error fallthrough false float32 float64 for func go goto if import int int8 int16 int32 int64 iota map nil package range return rune select string struct switch true type uint uint8 uint16 uint32 uint64 uintptr var'.split(
      ' ',
    ),
  types: true,
};

const JAVA: LanguageSpec = {
  comments: C_COMMENTS,
  strings: STRINGS,
  keywords:
    'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public record return sealed short static strictfp super switch synchronized this throw throws transient try var void volatile while yield true false null'.split(
      ' ',
    ),
  types: true,
};

const KOTLIN: LanguageSpec = {
  comments: C_COMMENTS,
  strings: STRINGS + '|' + PY_STRINGS,
  keywords:
    'abstract actual annotation as break by catch class companion const constructor continue data do else enum expect external false final finally for fun if import in infix init inline inner interface internal is late object open operator out override package private protected public reified return sealed super suspend tailrec this throw true try typealias val var vararg when where while'.split(
      ' ',
    ),
  types: true,
};

const SWIFT: LanguageSpec = {
  comments: C_COMMENTS,
  strings: STRINGS,
  keywords:
    'actor any as async await break case catch class continue default defer do else enum extension fallthrough false final for func guard if import in init inout internal is let nil open operator private protocol public repeat rethrows return self Self static struct super switch throw throws true try typealias var where while some'.split(
      ' ',
    ),
  types: true,
};

const C: LanguageSpec = {
  comments: C_COMMENTS,
  strings: STRINGS,
  keywords:
    'auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while _Bool _Complex _Imaginary'.split(
      ' ',
    ),
  preprocessor: true,
  types: true,
};

const CPP: LanguageSpec = {
  comments: C_COMMENTS,
  strings: STRINGS,
  keywords: [
    ...C.keywords,
    ...'class namespace template typename using virtual override new delete this nullptr constexpr consteval constinit noexcept explicit friend operator try catch throw static_cast dynamic_cast reinterpret_cast const_cast auto decltype mutable alignof typeid concept requires co_await co_return co_yield bool wchar_t char8_t char16_t char32_t'.split(
      ' ',
    ),
  ],
  preprocessor: true,
  types: true,
};

const PHP: LanguageSpec = {
  comments: [C_LINE_COMMENT, BLOCK_COMMENT, HASH_COMMENT],
  strings: STRINGS,
  keywords:
    'abstract and array as bool break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile enum extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while xor yield true false null'.split(
      ' ',
    ),
  variables: true,
  types: true,
};

const RUBY: LanguageSpec = {
  comments: [HASH_COMMENT],
  strings: STRINGS,
  keywords:
    'alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true unless until when while yield attr_accessor attr_reader attr_writer private protected public require require_relative lambda proc'.split(
      ' ',
    ),
  symbols: true,
  types: true,
};

const LUA: LanguageSpec = {
  comments: [String.raw`--\[\[[\s\S]*?\]\]`, String.raw`--[^\n]*`],
  strings: STRINGS,
  keywords:
    'and break do else elseif end false for function goto if in local nil not or repeat return then true until while'.split(
      ' ',
    ),
};

const R_LANG: LanguageSpec = {
  comments: [HASH_COMMENT],
  strings: STRINGS,
  keywords:
    'function if else for while repeat return break next library require TRUE FALSE NULL NA Inf NaN in'.split(
      ' ',
    ),
};

const SCALA: LanguageSpec = {
  comments: C_COMMENTS,
  strings: STRINGS + '|' + PY_STRINGS,
  keywords:
    'abstract case catch class def do else extends final finally for if implicit import lazy match new null object override package private protected return sealed super this throw trait true false type val var while with yield try'.split(
      ' ',
    ),
  types: true,
};

const DART: LanguageSpec = {
  comments: C_COMMENTS,
  strings: STRINGS + String.raw`|r"(?:[^"\\]|\\.)*"|r'(?:[^'\\]|\\.)*'`,
  keywords:
    'abstract as assert async await break case catch class const continue covariant default deferred do dynamic else enum export extends extension external factory false final finally for get if implements import in interface is late library mixin new null on operator part rethrow return set show static super switch sync this throw true try typedef var void while with yield'.split(
      ' ',
    ),
  types: true,
};

const CSS: LanguageSpec = {
  comments: [BLOCK_COMMENT],
  strings: STRINGS,
  keywords: ['important'],
  decls: true,
  atRules: true,
  colors: true,
};

const SPECS: Readonly<Record<string, LanguageSpec>> = {
  rust: RUST,
  rs: RUST,
  go: GO,
  golang: GO,
  java: JAVA,
  kotlin: KOTLIN,
  kt: KOTLIN,
  kts: KOTLIN,
  swift: SWIFT,
  c: C,
  h: C,
  cpp: CPP,
  'c++': CPP,
  cc: CPP,
  cxx: CPP,
  hpp: CPP,
  hh: CPP,
  php: PHP,
  ruby: RUBY,
  rb: RUBY,
  lua: LUA,
  r: R_LANG,
  scala: SCALA,
  dart: DART,
  css: CSS,
  scss: CSS,
  less: CSS,
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
    spec.preprocessor ? String.raw`(?<meta>^[ \t]*#[^\n]*)` : null,
    `(?<string>${spec.strings})`,
    `(?<keyword>\\b(?:${keywords.map(escapeRegExp).join('|')})\\b)`,
    spec.atRules ? String.raw`(?<keyword>@[\w-]+)` : null,
    `(?<number>${NUMBERS})`,
    spec.colors ? String.raw`(?<number>#[0-9a-fA-F]{3,8}\b)` : null,
    spec.types ? `(?<type>${TYPE_NAME})` : null,
    `(?<func>${IDENT_FUNC})`,
    spec.variables ? String.raw`(?<attr>\$[A-Za-z_]\w*)` : null,
    spec.symbols ? String.raw`(?<attr>:[A-Za-z_]\w*[!?]?)` : null,
    spec.decls ? String.raw`(?<attr>[a-zA-Z-]+(?=\s*:))` : null,
  ].filter(Boolean);
  return new RegExp(parts.join('|'), spec.preprocessor ? 'gm' : 'g');
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
