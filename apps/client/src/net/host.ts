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
import { randomPublicId, type Outgoing, type Seat, type ToHost } from './protocol.ts';

/** Everything needed to resume hosting after a page reload. Stays in the host's browser. */
export interface HostSnapshot {
  hostToken: string;
  seats: Seat[];
  /** Secret token → public id, for everyone who has a seat. */
  tokens: Record<string, string>;
  /** Tokens the host removed from the table. */
  banned: string[];
  state: GameState | null;
}

/**
 * The host's side of an online game. It owns the authoritative game state,
 * validates every move with the engine and decides what each peer may see.
 * It knows nothing about the network: every handler returns the messages to send.
 * Messages must already be validated (see validate.ts).
 */
export class HostSession {
  seats: Seat[];
  state: GameState | null;
  private tokens: Map<string, string>;
  private banned: Set<string>;
  /** Connected peer id → seat token. */
  private peers = new Map<string, string>();

  constructor(
    readonly hostToken: string,
    hostName: string,
    snapshot?: HostSnapshot | null,
  ) {
    // Saved games from an older version of the rules can't be resumed.
    if (snapshot && snapshot.hostToken === hostToken && (snapshot.state === null || 'turn' in snapshot.state)) {
      this.seats = snapshot.seats.map((s) => ({ ...s, online: s.host }));
      this.tokens = new Map(Object.entries(snapshot.tokens));
      this.banned = new Set(snapshot.banned);
      this.state = snapshot.state;
    } else {
      const id = randomPublicId();
      this.seats = [{ id, name: hostName, online: true, host: true }];
      this.tokens = new Map([[hostToken, id]]);
      this.banned = new Set();
      this.state = null;
    }
  }

  snapshot(): HostSnapshot {
    return {
      hostToken: this.hostToken,
      seats: this.seats,
      tokens: Object.fromEntries(this.tokens),
      banned: [...this.banned],
      state: this.state,
    };
  }

  get started(): boolean {
    return this.state !== null;
  }

  get hostId(): string {
    return this.tokens.get(this.hostToken)!;
  }

  viewFor(token: string): PlayerView | null {
    const id = this.tokens.get(token);
    return this.state && id ? playerView(this.state, id) : null;
  }

  hello(peer: string, msg: Extract<ToHost, { t: 'hello' }>): Outgoing[] {
    const reject = (reason: string): Outgoing[] => [{ peer, msg: { t: 'rejected', reason } }];
    const current = this.peers.get(peer);
    if (current !== undefined && current !== msg.token) return reject('One seat per connection.');
    if (msg.token === this.hostToken) return reject('That player is the host.');
    if (this.banned.has(msg.token)) return reject('The host removed you from this table.');

    const id = this.tokens.get(msg.token);
    const seat = id === undefined ? undefined : this.seats.find((s) => s.id === id);
    if (seat) {
      seat.online = true;
      if (!this.started) seat.name = msg.name;
    } else if (this.started) {
      return reject('This game has already started.');
    } else if (this.seats.length >= MAX_PLAYERS) {
      return reject('This table is full.');
    } else {
      const newId = randomPublicId();
      this.tokens.set(msg.token, newId);
      this.seats.push({ id: newId, name: msg.name, online: true, host: false });
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
    const id = this.tokens.get(token);
    if (this.started) {
      const seat = this.seats.find((s) => s.id === id);
      if (seat) seat.online = false;
    } else {
      this.seats = this.seats.filter((s) => s.id !== id);
      this.tokens.delete(token);
    }
    return this.broadcast();
  }

  /** Remove a player from the lobby and keep them out of this room. */
  kick(playerId: string): Outgoing[] {
    if (this.started) throw new Error('Players can only be removed before the game starts.');
    const token = [...this.tokens].find(([, id]) => id === playerId)?.[0];
    if (token === undefined || token === this.hostToken) return [];
    this.banned.add(token);
    this.tokens.delete(token);
    this.seats = this.seats.filter((s) => s.id !== playerId);
    const out: Outgoing[] = [];
    for (const [peer, t] of this.peers) {
      if (t !== token) continue;
      this.peers.delete(peer);
      out.push({ peer, msg: { t: 'rejected', reason: 'The host removed you from this table.' } });
    }
    return [...out, ...this.broadcast()];
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
    const token = peer === null ? this.hostToken : this.peers.get(peer);
    const id = token === undefined ? undefined : this.tokens.get(token);
    if (id === undefined) return { error: 'Unknown player.', out: [] };
    if (!this.state) return this.fail(peer, 'The game has not started.');
    const result = applyMove(this.state, id, move);
    if (!result.ok) return this.fail(peer, result.error);
    this.state = result.state;
    return { out: this.broadcast() };
  }

  private fail(peer: string | null, message: string): { error: string; out: Outgoing[] } {
    return { error: message, out: peer === null ? [] : [{ peer, msg: { t: 'error', message } }] };
  }

  /** The current lobby or game, tailored to every connected peer. */
  broadcast(): Outgoing[] {
    return [...this.peers].map(([peer, token]) => {
      const id = this.tokens.get(token)!;
      return {
        peer,
        msg: this.state
          ? { t: 'game', seats: this.seats, view: playerView(this.state, id) }
          : { t: 'lobby', seats: this.seats, you: id },
      };
    });
  }
}
