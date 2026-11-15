// Seite „Spielstände“: fortsetzen, exportieren, importieren, löschen.
import { deleteSave, exportSave, importSave, listSaves, type SaveEntry } from '../storage/saves';
import { storageAvailable } from '../storage/store';
import { download } from './classicGame';
import { h, type View } from './dom';
import { loadSession } from './session';

const when = (iso: string): string => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '') || 'spielstand';

export function savesView(): View {
  const el = h('main.page');
  let note: { text: string; bad: boolean } | null = null;
  let confirmId: string | null = null;

  const row = (e: SaveEntry): HTMLElement => h('li.save',
    h('div.save-info', h('strong', e.name), h('span', e.summary), h('small', `${e.auto ? 'Automatische Sicherung' : 'Benannter Spielstand'} · ${when(e.updatedAt)}`)),
    confirmId === e.id
      ? h('div.actions', h('span', 'Wirklich löschen?'), h('button.btn.primary', { type: 'button', onclick: () => { deleteSave(e.id); confirmId = null; note = { text: `„${e.name}“ gelöscht.`, bad: false }; draw(); } }, 'Ja, löschen'),
        h('button.btn', { type: 'button', onclick: () => { confirmId = null; draw(); } }, 'Abbrechen'))
      : h('div.actions',
        h('button.btn.primary', { type: 'button', onclick: () => { loadSession(e); location.hash = '#/spiel'; } }, 'Fortsetzen'),
        h('button.btn', { type: 'button', onclick: () => download(`boxenfunk-${slug(e.name)}.json`, exportSave(e)) }, 'Exportieren'),
        h('button.btn', { type: 'button', onclick: () => { confirmId = e.id; draw(); } }, 'Löschen')));

  function draw(): void {
    const list = listSaves();
    const file = h('input', { type: 'file', accept: 'application/json,.json', id: 'import-file', class: 'visually-hidden',
      onchange: async () => {
        const f = file.files?.[0];
        if (!f) return;
        try { const s = importSave(await f.text()); note = { text: `„${s.name}“ importiert.`, bad: false }; }
        catch (err) { note = { text: err instanceof Error ? err.message : 'Import fehlgeschlagen.', bad: true }; }
        draw();
      } });
    const parts: (HTMLElement | null)[] = [
      h('a.back', { href: '#/' }, '← Startseite'), h('h1', 'Spielstände'),
      storageAvailable() ? null : h('p.notice', { role: 'status' }, 'Dein Browser erlaubt kein dauerhaftes Speichern. Spielstände halten nur, bis du die Seite schließt – exportiere sie als Datei, um sie zu behalten.'),
      note ? h(note.bad ? 'p.form-error' : 'p.saved', { role: note.bad ? 'alert' : 'status' }, note.text) : null,
      list.length ? h('ul.saves', list.map(row)) : h('p.hint', 'Noch keine Spielstände. Laufende Spiele werden automatisch gesichert; im Spiel kannst du unter „Speichern & Pause“ zusätzlich benannte Stände anlegen.'),
      h('h2', 'Spielstand importieren'),
      h('p.hint', 'Eine exportierte Datei einlesen – zum Beispiel, um auf einem anderen Gerät weiterzuspielen.'),
      file, h('label.btn', { for: 'import-file' }, 'Datei auswählen')];
    el.replaceChildren(...parts.filter((n): n is HTMLElement => n !== null));
    note = null;
  }
  draw();
  return { el };
}
