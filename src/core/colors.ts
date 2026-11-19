// Spielerfarben im Stil von Teamlackierungen – bewusst ohne Teamnamen oder Logos.
// Jede Farbe hat ein Kürzel, damit Farbe nie der einzige Unterschied ist.
export interface PlayerColor { id: string; name: string; hex: string; ink: '#000' | '#fff' }

export const PLAYER_COLORS: PlayerColor[] = [
  { id: 'rosso', name: 'Rosso', hex: '#e8002d', ink: '#fff' },
  { id: 'papaya', name: 'Papaya', hex: '#ff8000', ink: '#000' },
  { id: 'silber', name: 'Silberpfeil', hex: '#27f4d2', ink: '#000' },
  { id: 'navy', name: 'Nachtblau', hex: '#3671c6', ink: '#fff' },
  { id: 'racing-green', name: 'Racing Green', hex: '#229971', ink: '#fff' },
  { id: 'pink', name: 'Pink', hex: '#ff87bc', ink: '#000' },
  { id: 'himmel', name: 'Himmelblau', hex: '#64c4ff', ink: '#000' },
  { id: 'gelb', name: 'Gelb', hex: '#ffd800', ink: '#000' },
  { id: 'weiss', name: 'Weiß', hex: '#f0f0f0', ink: '#000' },
  { id: 'neon', name: 'Neongrün', hex: '#52e252', ink: '#000' },
];

/** Stabile Farbe zu einem Namen (für Bestenlisten ohne gewählte Farbe). */
export function colorForName(name: string): PlayerColor {
  let hash = 0;
  for (const ch of name.toLowerCase()) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return PLAYER_COLORS[hash % PLAYER_COLORS.length];
}
