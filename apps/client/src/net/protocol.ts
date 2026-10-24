import type { Move, PlayerView } from '@triface/engine';

/**
 * A seat at the table. `id` is a public player id. A player's secret token,
 * which proves who they are when they reconnect, never leaves the host.
 */
export interface Seat {
  id: string;
  name: string;
  online: boolean;
  host: boolean;
}

/** Guest → host. */
export type ToHost = { t: 'hello'; token: string; name: string } | { t: 'move'; move: Move };

/**
 * Host → guest, always signed. The host greets every new peer with `welcome`;
 * a guest only reveals its token (in `hello`) to a peer whose welcome is signed
 * by the host. Guests only ever receive their own view of the game.
 */
export type ToGuest =
  | { t: 'welcome' }
  | { t: 'lobby'; seats: Seat[]; you: string }
  | { t: 'game'; seats: Seat[]; view: PlayerView }
  | { t: 'error'; message: string }
  | { t: 'rejected'; reason: string };

/** A message for one connected peer. */
export interface Outgoing {
  peer: string;
  msg: ToGuest;
}

const hex = (bytes: number): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');

/** A player's secret: 128 random bits. */
export const randomToken = (): string => hex(16);

/** A player's public id, shown to everyone. */
export const randomPublicId = (): string => hex(8);
