import type { CommandAssessment } from './CommandAssessment.js';

/** Conservative syntax parsing; a shell expression can never be allowlisted. */
export class CommandRiskClassifier {
  assess(command: string): CommandAssessment {
    const containsShellSyntax = /[&|;<>`\r\n]|\$\(|[(){}]|\$|\*/.test(command);
    const tokens: string[] = [];
    let token = '',
      quote = '',
      escaped = false,
      active = false,
      invalid = false;
    for (const char of command) {
      if (escaped) {
        token += char;
        escaped = false;
        active = true;
        continue;
      }
      if (char === '\\' && quote !== "'") {
        escaped = true;
        active = true;
        continue;
      }
      if (quote) {
        if (char === quote) quote = '';
        else token += char;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        active = true;
        continue;
      }
      if (/\s/.test(char)) {
        if (active) tokens.push(token);
        token = '';
        active = false;
        continue;
      }
      token += char;
      active = true;
    }
    if (active) tokens.push(token);
    if (quote || escaped || tokens.length === 0 || /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0] ?? ''))
      invalid = true;
    const normalized = tokens.join(' ').toLowerCase();
    const destructive =
      /(?:^|[\s;&|])(?:rm|rmdir)\s+.*(?:-[a-z]*r|--recursive)/i.test(command) ||
      /(?:^|[\s;&|])find\b.*-delete\b/i.test(command) ||
      /\bgit\s+(?:clean\b.*-[a-z]*[fd]|reset\s+--hard)/i.test(command) ||
      /\b(?:remove-item|del|erase|format|mkfs(?:\.[a-z0-9]+)?)\b/i.test(normalized);
    return {
      originalCommand: command,
      executable: invalid ? null : (tokens[0] ?? null),
      args: tokens.slice(1),
      containsShellSyntax,
      allowlistKey: invalid || containsShellSyntax ? null : JSON.stringify(tokens),
      risk: destructive ? 'Destructive' : 'ProcessExecution',
      reasons: destructive
        ? ['Destructive command pattern detected']
        : containsShellSyntax || invalid
          ? ['Command contains shell syntax or cannot be parsed unambiguously']
          : [],
    };
  }
  matches(command: CommandAssessment, allowlist: readonly string[]): boolean {
    return (
      command.allowlistKey !== null &&
      allowlist.some((entry) => this.assess(entry).allowlistKey === command.allowlistKey)
    );
  }
}
