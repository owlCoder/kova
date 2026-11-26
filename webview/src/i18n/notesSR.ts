/** Lifecycle note texts from the transcript timeline (webview/src/state/timeline.ts). */
export const notesSR: Readonly<Record<string, string>> = {
  'Output token limit reached': 'Dostignut je limit izlaznih tokena',
  'Tool repair {attempt}/2': 'Popravka alata {attempt}/2',
  'Guardrail · {action}': 'Zaštitna provera · {action}',
  'Hook {hookId} · {outcome}': 'Huk {hookId} · {outcome}',
  'Skill · {name}': 'Veština · {name}',
  'Project rules · {path}': 'Projektna pravila · {path}',
  'MCP server {serverId} started': 'MCP server {serverId} je pokrenut',
  'MCP server {serverId} stopped': 'MCP server {serverId} je zaustavljen',
  'Configuration reloaded · {count} MCP server changes':
    'Konfiguracija je ponovo učitana · promena MCP servera: {count}',
  'Configuration reloaded · {count} MCP server changes · hooks updated':
    'Konfiguracija je ponovo učitana · promena MCP servera: {count} · hukovi ažurirani',
  'Agent stopped · {reason}': 'Agent je zaustavljen · {reason}',
};
