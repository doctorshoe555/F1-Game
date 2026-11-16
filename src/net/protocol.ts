import type { PlayerView } from '../core/race';
import type { Answer } from '../core/types';

export type ClientMsg =
  | { t: 'hello'; token?: string; name: string; color: string; avatar: string }
  | { t: 'ping'; c: number }
  | { t: 'answer'; index: number; a: Answer; at: number }
  | { t: 'bye' };

export type RejectReason = 'name-taken' | 'full' | 'bad-name';
export type HostMsg =
  | { t: 'welcome'; id: string; token: string }
  | { t: 'reject'; reason: RejectReason }
  | { t: 'pong'; c: number; h: number }
  | { t: 'view'; v: PlayerView }
  | { t: 'closed' };

export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // ohne I und O (Verwechslung mit 1 und 0)
export const newRoomCode = (rnd: () => number = Math.random): string => Array.from({ length: 4 }, () => ROOM_ALPHABET[Math.floor(rnd() * ROOM_ALPHABET.length)]).join('');
export const cleanRoomCode = (raw: string): string => raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
export const isClientMsg = (m: unknown): m is ClientMsg => typeof m === 'object' && m !== null && typeof (m as { t?: unknown }).t === 'string';
