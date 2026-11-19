// Uhrenabgleich zwischen Handy und Host und Zeitstempelausgleich – ohne Server, so fair es geht.

export interface PingSample { sentAt: number; receivedAt: number; hostTime: number }

/**
 * Schätzt „Host-Uhr minus eigene Uhr“. Die Messung mit der kürzesten Laufzeit ist die genaueste,
 * weil sich dort Hin- und Rückweg am wenigsten unterscheiden können.
 */
export function estimateOffset(samples: PingSample[]): { offset: number; rtt: number } | null {
  let best: { offset: number; rtt: number } | null = null;
  for (const s of samples) {
    const rtt = s.receivedAt - s.sentAt;
    if (rtt < 0) continue;
    if (!best || rtt < best.rtt) best = { offset: s.hostTime - (s.sentAt + rtt / 2), rtt };
  }
  return best;
}

/** Höchster Rückstand, den der Host einem Handy für seine Netzlaufzeit gutschreibt. */
export const MAX_LAG_MS = 1500;

/**
 * Zeitpunkt, zu dem der Host eine Aktion wertet. Das Handy meldet, wann (in Host-Zeit) getippt wurde.
 * Der Host glaubt das nur in Grenzen: nie nach dem Eintreffen, höchstens MAX_LAG_MS davor und nie vor dem
 * frühestmöglichen Zeitpunkt (z. B. Fragenbeginn). So gleicht er langsame Verbindungen aus, ohne dass sich
 * mit einer verstellten Uhr viel herausholen lässt.
 */
export function compensate(claimedAt: unknown, receivedAt: number, earliest: number, maxLag = MAX_LAG_MS): number {
  const claimed = typeof claimedAt === 'number' && Number.isFinite(claimedAt) ? claimedAt : receivedAt;
  return Math.max(earliest, Math.max(receivedAt - maxLag, Math.min(claimed, receivedAt)));
}
