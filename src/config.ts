/** Repository des Projekts – Ziel für „Frage falsch?“-Meldungen (vorausgefülltes GitHub-Issue). */
export const REPO_URL = 'https://github.com/doctorshoe555/F1-Game';

export function reportUrl(q: { id: string; question: string }, answer: string): string {
  const body = `**Frage** (\`${q.id}\`)\n${q.question}\n\n**Hinterlegte Antwort**\n${answer}\n\n**Was stimmt nicht?**\n\n\n**Quelle / Beleg (wenn vorhanden)**\n`;
  return `${REPO_URL}/issues/new?title=${encodeURIComponent(`Frage melden: ${q.id}`)}&labels=${encodeURIComponent('frage')}&body=${encodeURIComponent(body)}`;
}
