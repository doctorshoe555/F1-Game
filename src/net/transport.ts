// Transport-Schicht: Der Host nimmt Verbindungen an, Handys verbinden sich über den Raum-Code.
// Zwei Umsetzungen hinter derselben Schnittstelle:
//  - PeerJS (WebRTC-Datenkanäle, öffentlicher Broker nur für den Verbindungsaufbau)
//  - „local“ (BroadcastChannel im selben Browser) für Tests und zum Ausprobieren ohne Netz: ?net=local
import type { DataConnection, Peer as PeerType } from 'peerjs';

export type HostStatus = { s: 'connecting' } | { s: 'open' } | { s: 'error'; reason: 'code-taken' | 'offline' | 'unsupported'; detail?: string };
export type ClientStatus = { s: 'connecting' } | { s: 'open' } | { s: 'retrying'; reason: 'lost' | 'no-room' | 'offline' };

export interface HostTransport {
  send(conn: string, msg: unknown): void;
  close(): void;
}
export interface HostHandlers { status(st: HostStatus): void; message(conn: string, msg: unknown): void; closed(conn: string): void }

export interface ClientTransport { send(msg: unknown): void; close(): void }
export interface ClientHandlers { status(st: ClientStatus): void; message(msg: unknown): void }

export type NetKind = 'peer' | 'local';
export const netKind = (): NetKind => (new URLSearchParams(location.search).get('net') === 'local' ? 'local' : 'peer');
const peerId = (code: string): string => `boxenfunk-quiz-${code}`;

export function createHost(code: string, h: HostHandlers, kind: NetKind = netKind()): HostTransport {
  return kind === 'local' ? localHost(code, h) : peerHost(code, h);
}
export function createClient(code: string, h: ClientHandlers, kind: NetKind = netKind()): ClientTransport {
  return kind === 'local' ? localClient(code, h) : peerClient(code, h);
}

// ---------------- PeerJS ----------------
function peerHost(code: string, h: HostHandlers): HostTransport {
  const conns = new Map<string, DataConnection>();
  let peer: PeerType | null = null;
  let closed = false;
  h.status({ s: 'connecting' });
  void import('peerjs').then(({ Peer }) => {
    if (closed) return;
    peer = new Peer(peerId(code));
    peer.on('open', () => h.status({ s: 'open' }));
    peer.on('connection', (c) => {
      c.on('open', () => conns.set(c.connectionId, c));
      c.on('data', (d) => h.message(c.connectionId, d));
      const gone = (): void => { if (conns.delete(c.connectionId)) h.closed(c.connectionId); };
      c.on('close', gone); c.on('error', gone);
    });
    // Verbindung zum Broker weg: bestehende Datenkanäle laufen weiter, neue Spieler kämen aber nicht mehr rein.
    peer.on('disconnected', () => { if (!closed) { h.status({ s: 'connecting' }); setTimeout(() => { if (!closed && peer && !peer.destroyed) peer.reconnect(); }, 1500); } });
    peer.on('error', (e) => {
      const type = (e as { type?: string }).type;
      if (type === 'unavailable-id') h.status({ s: 'error', reason: 'code-taken' });
      else if (type === 'browser-incompatible') h.status({ s: 'error', reason: 'unsupported' });
      else if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') h.status({ s: 'error', reason: 'offline', detail: type });
    });
  }).catch(() => h.status({ s: 'error', reason: 'unsupported' }));
  return {
    send(conn, msg) { const c = conns.get(conn); if (c?.open) { try { c.send(msg); } catch { /* Kanal gerade geschlossen */ } } },
    close() { closed = true; try { peer?.destroy(); } catch { /* egal */ } },
  };
}

function peerClient(code: string, h: ClientHandlers): ClientTransport {
  let peer: PeerType | null = null;
  let conn: DataConnection | null = null;
  let closed = false;
  let timer = 0;
  let attempt = 0;
  const retry = (reason: 'lost' | 'no-room' | 'offline'): void => {
    if (closed) return;
    h.status({ s: 'retrying', reason });
    try { peer?.destroy(); } catch { /* egal */ }
    peer = null; conn = null;
    clearTimeout(timer);
    timer = window.setTimeout(connect, Math.min(1000 + attempt++ * 500, 4000));
  };
  function connect(): void {
    if (closed) return;
    void import('peerjs').then(({ Peer }) => {
      if (closed) return;
      const p = new Peer();
      peer = p;
      p.on('open', () => {
        const c = p.connect(peerId(code), { reliable: true });
        conn = c;
        c.on('open', () => { attempt = 0; h.status({ s: 'open' }); });
        c.on('data', (d) => h.message(d));
        c.on('close', () => { if (peer === p) retry('lost'); });
        c.on('error', () => { if (peer === p) retry('lost'); });
      });
      p.on('error', (e) => { if (peer === p) retry((e as { type?: string }).type === 'peer-unavailable' ? 'no-room' : 'offline'); });
      p.on('disconnected', () => { if (peer === p && !conn?.open) retry('offline'); });
    }).catch(() => retry('offline'));
  }
  h.status({ s: 'connecting' });
  connect();
  return {
    send(msg) { if (conn?.open) { try { conn.send(msg); } catch { /* wird beim nächsten Versuch neu aufgebaut */ } } },
    close() { closed = true; clearTimeout(timer); try { peer?.destroy(); } catch { /* egal */ } },
  };
}

// ---------------- lokal (BroadcastChannel) ----------------
type Wire = { to: string; from: string; k: 'open' | 'ack' | 'msg' | 'close' | 'host-up'; d?: unknown };

function localHost(code: string, h: HostHandlers): HostTransport {
  const ch = new BroadcastChannel(peerId(code));
  const known = new Set<string>();
  ch.onmessage = (ev: MessageEvent<Wire>) => {
    const w = ev.data;
    if (w.to !== 'host') return;
    if (w.k === 'open') { known.add(w.from); ch.postMessage({ to: w.from, from: 'host', k: 'ack' } satisfies Wire); }
    else if (w.k === 'msg' && known.has(w.from)) h.message(w.from, w.d);
    else if (w.k === 'close' && known.delete(w.from)) h.closed(w.from);
  };
  setTimeout(() => { h.status({ s: 'open' }); ch.postMessage({ to: '*', from: 'host', k: 'host-up' } satisfies Wire); }, 0);
  return {
    send(conn, msg) { if (known.has(conn)) ch.postMessage({ to: conn, from: 'host', k: 'msg', d: msg } satisfies Wire); },
    close() { ch.close(); },
  };
}

function localClient(code: string, h: ClientHandlers): ClientTransport {
  const ch = new BroadcastChannel(peerId(code));
  const me = `c-${Math.random().toString(36).slice(2, 10)}`;
  let open = false;
  const knock = (): void => ch.postMessage({ to: 'host', from: me, k: 'open' } satisfies Wire);
  ch.onmessage = (ev: MessageEvent<Wire>) => {
    const w = ev.data;
    if (w.k === 'host-up') { open = false; h.status({ s: 'retrying', reason: 'lost' }); knock(); return; }
    if (w.to !== me) return;
    if (w.k === 'ack') { if (!open) { open = true; h.status({ s: 'open' }); } } else if (w.k === 'msg') h.message(w.d);
  };
  const timer = window.setInterval(() => { if (!open) knock(); }, 800);
  const bye = (): void => ch.postMessage({ to: 'host', from: me, k: 'close' } satisfies Wire);
  window.addEventListener('pagehide', bye);
  h.status({ s: 'connecting' });
  knock();
  return {
    send(msg) { if (open) ch.postMessage({ to: 'host', from: me, k: 'msg', d: msg } satisfies Wire); },
    close() { clearInterval(timer); window.removeEventListener('pagehide', bye); bye(); ch.close(); },
  };
}
