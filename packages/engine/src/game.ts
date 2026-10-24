import { checkPlacement, legalPlacements, type Placement } from './board.ts';
import { DECK, card, cardName } from './cards.ts';
import type { Vec } from './geometry.ts';
import { shuffle } from './rng.ts';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export interface GameConfig {
  /** Board edge, in lattice steps from the center. */
  radius: number;
  /** The match ends once someone reaches this many penalty points. */
  targetScore: number;
}

export const DEFAULT_CONFIG: GameConfig = { radius: 8, targetScore: 25 };

export interface PlayerState {
  id: string;
  name: string;
  hand: number[];
  score: number;
}

/** What happens to the turn order once the current play is resolved. */
interface Advance {
  skip: boolean;
  again: boolean;
}

export type Phase =
  | { kind: 'play' }
  | { kind: 'drawn'; cardId: number }
  | { kind: 'comboDiscard'; then: Advance }
  | { kind: 'roundOver'; winner: string | null }
  | { kind: 'gameOver'; winner: string };

export interface GameState {
  config: GameConfig;
  players: PlayerState[];
  deck: number[];
  discard: number[];
  board: Placement[];
  current: number;
  direction: 1 | -1;
  dealer: number;
  round: number;
  phase: Phase;
  /** Consecutive forced passes; when everyone has passed, the round is stuck. */
  passes: number;
  seed: number;
  log: string[];
}

export type Move =
  | { type: 'place'; cardId: number; at: Vec }
  | { type: 'draw' }
  | { type: 'pass' }
  | { type: 'discard'; cardId: number }
  | { type: 'skipDiscard' }
  | { type: 'nextRound' };

export type MoveResult = { ok: true; state: GameState } | { ok: false; error: string };

export function createGame(
  players: { id: string; name: string }[],
  seed: number,
  config: GameConfig = DEFAULT_CONFIG,
): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`Triface needs ${MIN_PLAYERS}–${MAX_PLAYERS} players`);
  }
  const state: GameState = {
    config,
    players: players.map((p) => ({ ...p, hand: [], score: 0 })),
    deck: [],
    discard: [],
    board: [],
    current: 0,
    direction: 1,
    dealer: players.length - 1,
    round: 0,
    phase: { kind: 'play' },
    passes: 0,
    seed,
    log: [],
  };
  dealRound(state);
  return state;
}

export const handSize = (playerCount: number): number => (playerCount <= 4 ? 6 : 5);

function dealRound(s: GameState): void {
  s.round++;
  s.dealer = (s.dealer + 1) % s.players.length;
  s.deck = DECK.map((c) => c.id);
  s.seed = shuffle(s.deck, s.seed);
  s.discard = [];
  s.direction = 1;
  s.passes = 0;
  const size = handSize(s.players.length);
  for (const p of s.players) p.hand = s.deck.splice(0, size);
  const first = s.deck.shift()!;
  s.board = [{ cardId: first, at: { a: 0, b: 0 } }];
  s.current = (s.dealer + 1) % s.players.length;
  s.phase = { kind: 'play' };
  s.log.push(`Round ${s.round} begins with ${cardName(card(first))}.`);
}

/** Draw one card for player `index`, reshuffling the discard pile if needed. */
function drawCard(s: GameState, index: number): number | undefined {
  if (s.deck.length === 0 && s.discard.length > 0) {
    s.deck = s.discard;
    s.discard = [];
    s.seed = shuffle(s.deck, s.seed);
    s.log.push('The discard pile is shuffled into a new draw pile.');
  }
  const id = s.deck.shift();
  if (id !== undefined) s.players[index]!.hand.push(id);
  return id;
}

const step = (s: GameState, n: number): number =>
  (((s.current + s.direction * n) % s.players.length) + s.players.length) % s.players.length;

function advance(s: GameState, how: Advance): void {
  if (!how.again) s.current = step(s, how.skip ? 2 : 1);
  s.phase = { kind: 'play' };
}

function endRound(s: GameState, winner: string | null): void {
  for (const p of s.players) p.score += p.hand.reduce((sum, id) => sum + card(id).num, 0);
  const name = (id: string) => s.players.find((p) => p.id === id)!.name;
  s.log.push(winner ? `${name(winner)} goes out and wins round ${s.round}!` : `Round ${s.round} is stuck.`);
  if (s.players.some((p) => p.score >= s.config.targetScore)) {
    const best = s.players.reduce((a, b) => (b.score < a.score ? b : a));
    s.phase = { kind: 'gameOver', winner: best.id };
    s.log.push(`${best.name} wins the match with ${best.score} points.`);
  } else {
    s.phase = { kind: 'roundOver', winner };
  }
}

/** Is `index` holding at least one card that can be placed right now? */
export function canPlace(s: GameState, index: number): boolean {
  return s.players[index]!.hand.some((id) => legalPlacements(s.board, id, s.config.radius).length > 0);
}

function place(s: GameState, cardId: number, at: Vec): string | null {
  const player = s.players[s.current]!;
  if (!player.hand.includes(cardId)) return 'That card is not in your hand.';
  if (s.phase.kind === 'drawn' && s.phase.cardId !== cardId) return 'You may only place the card you drew.';
  const check = checkPlacement(s.board, cardId, at, s.config.radius);
  if (!check.ok) return `Illegal placement (${check.reason}).`;

  player.hand.splice(player.hand.indexOf(cardId), 1);
  s.board.push({ cardId, at });
  s.passes = 0;
  const placed = card(cardId);
  s.log.push(`${player.name} places ${cardName(placed)}.`);

  if (player.hand.length === 0) {
    endRound(s, player.id);
    return null;
  }

  const how: Advance = { skip: false, again: false };
  if (check.covers.some((c) => c.surface === 'face')) {
    switch (placed.shape) {
      case 'ring':
        if (s.players.length === 2) {
          how.skip = true;
          s.log.push('Ring: the opponent is skipped.');
        } else {
          s.direction = s.direction === 1 ? -1 : 1;
          s.log.push('Ring: play reverses.');
        }
        break;
      case 'spike':
        s.players.forEach((_, i) => i !== s.current && drawCard(s, i));
        s.log.push('Spike: every opponent draws 1.');
        break;
      case 'block':
        how.skip = true;
        s.log.push('Block: the next player is skipped.');
        break;
      case 'star':
        how.again = true;
        s.log.push(`Star: ${player.name} plays again.`);
        break;
    }
  }

  if (check.covers.length >= 2) {
    s.log.push(`Combo! ${player.name} may discard a card.`);
    s.phase = { kind: 'comboDiscard', then: how };
  } else {
    advance(s, how);
  }
  return null;
}

function apply(s: GameState, playerId: string, move: Move): string | null {
  const { phase } = s;
  if (move.type === 'nextRound') {
    if (phase.kind !== 'roundOver') return 'The round is not over.';
    dealRound(s);
    return null;
  }
  if (phase.kind === 'roundOver' || phase.kind === 'gameOver') return 'The round is over.';
  const player = s.players[s.current]!;
  if (player.id !== playerId) return 'It is not your turn.';

  switch (move.type) {
    case 'place':
      if (phase.kind !== 'play' && phase.kind !== 'drawn') return 'You cannot place a card now.';
      return place(s, move.cardId, move.at);

    case 'draw': {
      if (phase.kind !== 'play') return 'You cannot draw now.';
      const id = drawCard(s, s.current);
      if (id === undefined) return 'There is nothing left to draw. Pass instead.';
      s.passes = 0;
      s.log.push(`${player.name} draws a card.`);
      if (legalPlacements(s.board, id, s.config.radius).length > 0) s.phase = { kind: 'drawn', cardId: id };
      else advance(s, { skip: false, again: false });
      return null;
    }

    case 'pass':
      if (phase.kind === 'drawn') {
        s.log.push(`${player.name} keeps the drawn card.`);
        advance(s, { skip: false, again: false });
        return null;
      }
      if (phase.kind !== 'play') return 'You cannot pass now.';
      if (s.deck.length + s.discard.length > 0) return 'You must draw if you cannot place.';
      if (canPlace(s, s.current)) return 'You can still place a card.';
      s.passes++;
      s.log.push(`${player.name} passes.`);
      if (s.passes >= s.players.length) endRound(s, null);
      else advance(s, { skip: false, again: false });
      return null;

    case 'discard':
      if (phase.kind !== 'comboDiscard') return 'There is nothing to discard for.';
      if (!player.hand.includes(move.cardId)) return 'That card is not in your hand.';
      player.hand.splice(player.hand.indexOf(move.cardId), 1);
      s.discard.push(move.cardId);
      s.log.push(`${player.name} discards ${cardName(card(move.cardId))}.`);
      if (player.hand.length === 0) endRound(s, player.id);
      else advance(s, phase.then);
      return null;

    case 'skipDiscard':
      if (phase.kind !== 'comboDiscard') return 'There is nothing to skip.';
      advance(s, phase.then);
      return null;
  }
}

/** Apply a move without mutating the input state. */
export function applyMove(state: GameState, playerId: string, move: Move): MoveResult {
  const next = structuredClone(state);
  const error = apply(next, playerId, move);
  return error ? { ok: false, error } : { ok: true, state: next };
}

/** What one player is allowed to see: their own hand, everyone else's hand size. */
export interface PlayerView extends Omit<GameState, 'players' | 'deck' | 'seed'> {
  me: string;
  players: (Omit<PlayerState, 'hand'> & { handCount: number; hand?: number[] })[];
  deckCount: number;
}

export function playerView(state: GameState, playerId: string): PlayerView {
  const { players, deck, seed: _seed, ...rest } = state;
  return {
    ...structuredClone(rest),
    me: playerId,
    players: players.map(({ hand, ...p }) => ({
      ...p,
      handCount: hand.length,
      ...(p.id === playerId ? { hand: [...hand] } : {}),
    })),
    deckCount: deck.length,
  };
}
