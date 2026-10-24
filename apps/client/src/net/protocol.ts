import type { Move, PlayerView } from '@triface/engine';

/** A seat at the table. `id` is the player's token, which survives reconnects. */
export interface Seat {
  id: string;
  name: string;
  online: boolean;
  host: boolean;
}

/** Guest → host. */
export type ToHost = { t: 'hello'; token: string; name: string } | { t: 'move'; move: Move };

/** Host → guest. Guests only ever receive their own view of the game. */
export type ToGuest =
  | { t: 'lobby'; seats: Seat[] }
  | { t: 'game'; seats: Seat[]; view: PlayerView }
  | { t: 'error'; message: string }
  | { t: 'rejected'; reason: string };

/** A message for one connected peer. */
export interface Outgoing {
  peer: string;
  msg: ToGuest;
}

// No 0/O, 1/I/L: room codes are read aloud and typed on phones.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomCode(length = 5): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const isRoomCode = (code: string): boolean =>
  code.length === 5 && [...code].every((c) => CODE_ALPHABET.includes(c));
