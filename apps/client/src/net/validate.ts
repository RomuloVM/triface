import { MAX_CARD_ID, MAX_PLAYERS, type Move } from '@triface/engine';
import type { Seat, ToGuest, ToHost } from './protocol.ts';

/*
 * Everything that arrives from the network is untrusted. These checks turn it
 * into well-formed messages or reject it, before any game code sees it.
 */

type Obj = Record<string, unknown>;

const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown, min: number, max: number): x is number =>
  Number.isInteger(x) && (x as number) >= min && (x as number) <= max;
const isText = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max;

export const TOKEN = /^[0-9a-f]{32}$/;
export const PUBLIC_ID = /^[0-9a-f]{16}$/;
const NAME_MAX = 20;

/** Clean up a display name: printable characters only, trimmed, capped. */
export function cleanName(name: string): string {
  // Drop control and bidi-override characters, which can garble or disguise names.
  const printable = name.replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  return [...printable].slice(0, NAME_MAX).join('') || 'Player';
}

export function parseMove(x: unknown): Move | null {
  if (!isObj(x)) return null;
  switch (x.type) {
    case 'place': {
      const at = x.at;
      if (!isInt(x.cardId, 0, MAX_CARD_ID) || !isObj(at)) return null;
      if (!isInt(at.a, -50, 50) || !isInt(at.b, -50, 50)) return null;
      return { type: 'place', cardId: x.cardId, at: { a: at.a, b: at.b } };
    }
    case 'discard':
      return isInt(x.cardId, 0, MAX_CARD_ID) ? { type: 'discard', cardId: x.cardId } : null;
    case 'draw':
    case 'endTurn':
    case 'lastCard':
    case 'nextRound':
      return { type: x.type };
    default:
      return null;
  }
}

export function parseToHost(x: unknown): ToHost | null {
  if (!isObj(x)) return null;
  if (x.t === 'hello') {
    if (typeof x.token !== 'string' || !TOKEN.test(x.token) || !isText(x.name, 200)) return null;
    return { t: 'hello', token: x.token, name: cleanName(x.name) };
  }
  if (x.t === 'move') {
    const move = parseMove(x.move);
    return move ? { t: 'move', move } : null;
  }
  return null;
}

function parseSeats(x: unknown): Seat[] | null {
  if (!Array.isArray(x) || x.length > MAX_PLAYERS) return null;
  const seats: Seat[] = [];
  for (const s of x) {
    if (!isObj(s) || typeof s.id !== 'string' || !PUBLIC_ID.test(s.id) || !isText(s.name, 64)) return null;
    if (typeof s.online !== 'boolean' || typeof s.host !== 'boolean') return null;
    seats.push({ id: s.id, name: cleanName(s.name), online: s.online, host: s.host });
  }
  return seats;
}

/**
 * Shape checks for a host message. It is already signature-verified, so this
 * guards against bugs and version mismatches rather than forgery; the UI's
 * error boundary catches anything subtler.
 */
export function parseToGuest(x: unknown): ToGuest | null {
  if (!isObj(x)) return null;
  switch (x.t) {
    case 'welcome':
      return { t: 'welcome' };
    case 'lobby': {
      const seats = parseSeats(x.seats);
      return seats && typeof x.you === 'string' && PUBLIC_ID.test(x.you) ? { t: 'lobby', seats, you: x.you } : null;
    }
    case 'game': {
      const seats = parseSeats(x.seats);
      const v = x.view;
      if (!seats || !isObj(v) || typeof v.me !== 'string' || !Array.isArray(v.players) || !Array.isArray(v.board)) {
        return null;
      }
      return { t: 'game', seats, view: v as unknown as Extract<ToGuest, { t: 'game' }>['view'] };
    }
    case 'error':
      return isText(x.message, 300) ? { t: 'error', message: x.message } : null;
    case 'rejected':
      return isText(x.reason, 300) ? { t: 'rejected', reason: x.reason } : null;
    default:
      return null;
  }
}
