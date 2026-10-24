import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  applyMove,
  createGame,
  playerView,
  type GameState,
  type Move,
  type PlayerView,
} from '@triface/engine';
import type { Outgoing, Seat, ToHost } from './protocol.ts';

/** Everything needed to resume hosting after a page reload. */
export interface HostSnapshot {
  seats: Seat[];
  state: GameState | null;
}

/**
 * The host's side of an online game. It owns the authoritative game state,
 * validates every move with the engine and decides what each peer may see.
 * It knows nothing about the network: every handler returns the messages to send.
 */
export class HostSession {
  seats: Seat[];
  state: GameState | null;
  /** Connected peer id → seat token. */
  private peers = new Map<string, string>();

  constructor(
    readonly hostId: string,
    hostName: string,
    snapshot?: HostSnapshot,
  ) {
    this.seats = snapshot?.seats.map((s) => ({ ...s, online: s.host })) ?? [
      { id: hostId, name: hostName, online: true, host: true },
    ];
    this.state = snapshot?.state ?? null;
  }

  snapshot(): HostSnapshot {
    return { seats: this.seats, state: this.state };
  }

  get started(): boolean {
    return this.state !== null;
  }

  viewFor(token: string): PlayerView | null {
    return this.state ? playerView(this.state, token) : null;
  }

  hello(peer: string, msg: Extract<ToHost, { t: 'hello' }>): Outgoing[] {
    const name = msg.name.trim().slice(0, 20) || 'Player';
    const seat = this.seats.find((s) => s.id === msg.token);
    if (seat?.host) return [{ peer, msg: { t: 'rejected', reason: 'That player is the host.' } }];
    if (seat) {
      seat.online = true;
      if (!this.started) seat.name = name;
    } else if (this.started) {
      return [{ peer, msg: { t: 'rejected', reason: 'This game has already started.' } }];
    } else if (this.seats.length >= MAX_PLAYERS) {
      return [{ peer, msg: { t: 'rejected', reason: 'This table is full.' } }];
    } else {
      this.seats.push({ id: msg.token, name, online: true, host: false });
    }
    this.peers.set(peer, msg.token);
    return this.broadcast();
  }

  leave(peer: string): Outgoing[] {
    const token = this.peers.get(peer);
    if (token === undefined) return [];
    this.peers.delete(peer);
    // Someone may have reconnected on a new peer id already.
    if ([...this.peers.values()].includes(token)) return [];
    if (this.started) {
      const seat = this.seats.find((s) => s.id === token);
      if (seat) seat.online = false;
    } else {
      this.seats = this.seats.filter((s) => s.id !== token);
    }
    return this.broadcast();
  }

  start(seed: number): Outgoing[] {
    if (this.started) throw new Error('The game has already started.');
    if (this.seats.length < MIN_PLAYERS) throw new Error(`At least ${MIN_PLAYERS} players are needed.`);
    this.state = createGame(
      this.seats.map(({ id, name }) => ({ id, name })),
      seed,
    );
    return this.broadcast();
  }

  /** A move from a guest peer, or from the host itself when `peer` is null. */
  move(peer: string | null, move: Move): { error?: string; out: Outgoing[] } {
    const token = peer === null ? this.hostId : this.peers.get(peer);
    if (token === undefined) return { error: 'Unknown player.', out: [] };
    if (!this.state) return this.fail(peer, 'The game has not started.');
    const result = applyMove(this.state, token, move);
    if (!result.ok) return this.fail(peer, result.error);
    this.state = result.state;
    return { out: this.broadcast() };
  }

  private fail(peer: string | null, message: string): { error: string; out: Outgoing[] } {
    return { error: message, out: peer === null ? [] : [{ peer, msg: { t: 'error', message } }] };
  }

  /** The current lobby or game, tailored to every connected peer. */
  broadcast(): Outgoing[] {
    return [...this.peers].map(([peer, token]) => ({
      peer,
      msg: this.state
        ? { t: 'game', seats: this.seats, view: playerView(this.state, token) }
        : { t: 'lobby', seats: this.seats },
    }));
  }
}
