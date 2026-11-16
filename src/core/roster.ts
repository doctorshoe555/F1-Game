// Teilnehmerliste eines Netzwerkspiels: Beitritt und Wiedereinstieg. Reine Funktionen.
export interface NetPlayer {
  id: string;
  name: string;
  color: string;
  avatar: string;
  score: number;
  correct: number;
  streak: number;
  connected: boolean;
}
export interface Hello { token?: string; name: string; color: string; avatar: string }
export type JoinResult =
  | { status: 'new' | 'rejoined'; players: NetPlayer[]; tokens: Record<string, string>; player: NetPlayer; token: string }
  | { status: 'name-taken' | 'full' | 'bad-name'; players: NetPlayer[]; tokens: Record<string, string> };

export const MAX_NET_PLAYERS = 12;
const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Beitritt oder Wiedereinstieg.
 * - Bekanntes Token → derselbe Spieler kommt zurück (Punkte bleiben).
 * - Gleicher Name wie ein gerade getrennter Spieler → Übernahme dieses Spielers (neues Gerät, gelöschter Speicher).
 * - Gleicher Name wie ein verbundener Spieler → abgelehnt.
 * `tokens` ordnet Spieler-id → geheimes Token zu und verlässt den Host nie in Ansichten.
 */
export function joinRoster(players: NetPlayer[], tokens: Record<string, string>, hello: Hello, newToken: () => string): JoinResult {
  const name = hello.name.trim().replace(/\s+/g, ' ').slice(0, 16);
  if (!name) return { status: 'bad-name', players, tokens };
  const reconnect = (p: NetPlayer, token: string): JoinResult => {
    const player = { ...p, connected: true, color: hello.color || p.color, avatar: hello.avatar || p.avatar };
    return { status: 'rejoined', players: players.map((x) => (x.id === p.id ? player : x)), tokens: { ...tokens, [p.id]: token }, player, token };
  };
  const byToken = hello.token ? players.find((p) => tokens[p.id] === hello.token) : undefined;
  if (byToken) return reconnect(byToken, hello.token!);
  const byName = players.find((p) => sameName(p.name, name));
  if (byName) return byName.connected ? { status: 'name-taken', players, tokens } : reconnect(byName, newToken());
  if (players.length >= MAX_NET_PLAYERS) return { status: 'full', players, tokens };
  let n = players.length + 1;
  while (players.some((p) => p.id === `p${n}`)) n++;
  const player: NetPlayer = { id: `p${n}`, name, color: hello.color, avatar: hello.avatar, score: 0, correct: 0, streak: 0, connected: true };
  const token = newToken();
  return { status: 'new', players: [...players, player], tokens: { ...tokens, [player.id]: token }, player, token };
}

export const setConnected = (players: NetPlayer[], id: string, connected: boolean): NetPlayer[] =>
  players.map((p) => (p.id === id && p.connected !== connected ? { ...p, connected } : p));

export interface NetRanked { player: NetPlayer; place: number }
export function rankPlayers(players: NetPlayer[]): NetRanked[] {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  let place = 0;
  return sorted.map((player, i) => { if (i === 0 || player.score !== sorted[i - 1].score) place = i + 1; return { player, place }; });
}
