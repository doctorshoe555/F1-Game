// Einen Spielstand aus der Liste wieder aufnehmen – je nach Art führt das an eine andere Stelle.
import { newRoomCode } from '../net/protocol';
import type { SaveEntry } from '../storage/saves';
import { save } from '../storage/store';
import { loadLocalJeopardy } from './jeopardyLocal';
import { loadSession } from './session';

export function resumeEntry(e: SaveEntry): void {
  if (e.kind === 'classic') { loadSession(e); location.hash = '#/spiel'; return; }
  if (loadLocalJeopardy(e)) { location.hash = '#/jeopardy/spiel'; return; }
  // Jeopardy per Handy: Der Host eröffnet einen Raum mit diesem Stand; die Fahrer steigen mit ihrem Namen wieder ein.
  if ('kind' in e.state) {
    save('host.session', { code: newRoomCode(), state: { ...e.state, players: e.state.players.map((p) => ({ ...p, connected: false })) }, tokens: {}, raceId: e.auto ? e.id : undefined });
    location.hash = '#/host';
  }
}
