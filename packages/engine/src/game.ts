import { checkPlacement, placementOptions, type Placement, type SurfaceRef } from './board.ts';
import { card, cardIds, cardName, points, type CardNumber, type Shape } from './cards.ts';
import type { Vec } from './geometry.ts';
import { shuffle } from './rng.ts';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;

export interface GameConfig {
  /** Board edge, in lattice steps from the center. */
  radius: number;
  /** The match ends once someone reaches this many penalty points. */
  targetScore: number;
  /** Decks shuffled together. */
  copies: number;
}

export const DEFAULT_CONFIG: GameConfig = { radius: 8, targetScore: 25, copies: 1 };

/** Big tables play with two decks on a bigger board. */
export const configFor = (playerCount: number): GameConfig =>
  playerCount >= 7 ? { radius: 10, targetScore: 25, copies: 2 } : DEFAULT_CONFIG;

/** Cards each Spike adds to a pending penalty. */
export const SPIKE_PENALTY = 2;

export interface PlayerState {
  id: string;
  name: string;
  hand: number[];
  score: number;
}

/** What the current player has done so far this turn. */
export interface TurnState {
  /** Cards placed this turn. */
  placed: number;
  /** Players to skip when the turn ends (Block). */
  skips: number;
  /** Take another turn when this one ends (Star). */
  again: boolean;
  /** Combo discards still allowed. */
  discards: number;
}

/** Cards waiting for the next player, who must answer with a Spike or take them. */
export interface Penalty {
  count: number;
  /** Player who played the last Spike; the penalty is aimed at whoever plays after them. */
  from: string;
}

export type Phase =
  /** Start of a turn: place a card, or draw. */
  | { kind: 'play' }
  /** Drew a card that fits: place it, or end the turn. */
  | { kind: 'drawn'; cardId: number }
  /** Placed a card: place more with the same number, or end the turn. */
  | { kind: 'placed'; chain: CardNumber | null }
  /** Nothing left to do but end the turn. */
  | { kind: 'done' }
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
  turn: TurnState;
  penalty: Penalty | null;
  /** Players holding one card who have called "Last card". */
  called: string[];
  /** The current player tried to end their turn without calling "Last card". */
  owesCall: boolean;
  /** Consecutive forced passes; when everyone has passed, the round is stuck. */
  passes: number;
  seed: number;
  log: string[];
}

export type Move =
  | { type: 'place'; cardId: number; at: Vec }
  | { type: 'draw' }
  | { type: 'discard'; cardId: number }
  | { type: 'endTurn' }
  | { type: 'lastCard' }
  | { type: 'nextRound' };

export type MoveResult = { ok: true; state: GameState } | { ok: false; error: string };

const freshTurn = (): TurnState => ({ placed: 0, skips: 0, again: false, discards: 0 });

export function createGame(
  players: { id: string; name: string }[],
  seed: number,
  config: GameConfig = configFor(players.length),
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
    turn: freshTurn(),
    penalty: null,
    called: [],
    owesCall: false,
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
  s.deck = cardIds(s.config.copies);
  s.seed = shuffle(s.deck, s.seed);
  s.discard = [];
  s.direction = 1;
  s.passes = 0;
  s.penalty = null;
  s.called = [];
  s.owesCall = false;
  s.turn = freshTurn();
  const size = handSize(s.players.length);
  for (const p of s.players) p.hand = s.deck.splice(0, size);
  // Start from a plain card, so the first player has real surfaces to match.
  const first = s.deck.findIndex((id) => card(id).special === null);
  const [start] = s.deck.splice(first, 1);
  s.board = [{ cardId: start!, at: { a: 0, b: 0 } }];
  s.current = (s.dealer + 1) % s.players.length;
  s.phase = { kind: 'play' };
  s.log.push(`Round ${s.round} begins with ${cardName(card(start!))}.`);
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

function endRound(s: GameState, winner: string | null): void {
  for (const p of s.players) p.score += p.hand.reduce((sum, id) => sum + points(card(id)), 0);
  const name = (id: string) => s.players.find((p) => p.id === id)!.name;
  s.log.push(winner ? `${name(winner)} goes out and wins round ${s.round}!` : `Round ${s.round} is stuck.`);
  s.penalty = null;
  if (s.players.some((p) => p.score >= s.config.targetScore)) {
    const best = s.players.reduce((a, b) => (b.score < a.score ? b : a));
    s.phase = { kind: 'gameOver', winner: best.id };
    s.log.push(`${best.name} wins the match with ${best.score} points.`);
  } else {
    s.phase = { kind: 'roundOver', winner };
  }
}

/**
 * The shape power a placement triggers: a card's own shape when it covers a
 * face, or for a Mirror, the shape of the face it covers. Bridges have none.
 */
export function placementPower(board: readonly Placement[], cardId: number, covers: SurfaceRef[]): Shape | null {
  const face = covers.find((c) => c.surface === 'face');
  if (!face) return null;
  const placed = card(cardId);
  if (placed.special === 'mirror') return card(board[face.placement]!.cardId).shape;
  return placed.shape;
}

/** The turn as anyone at the table can see it; a player view satisfies this. */
export interface TurnContext {
  board: readonly Placement[];
  phase: { kind: Phase['kind']; cardId?: number; chain?: CardNumber | null };
  penalty: Penalty | null;
}

/** Is `playerId` facing a penalty they must answer or take? */
export const facingPenalty = (ctx: TurnContext, playerId: string): boolean =>
  ctx.phase.kind === 'play' && ctx.penalty !== null && ctx.penalty.from !== playerId;

/**
 * Why `playerId` may not place `cardId` on a spot covering `covers` at this
 * point of the turn, or null if they may. Board legality is checked separately.
 */
export function turnRule(ctx: TurnContext, playerId: string, cardId: number, covers: SurfaceRef[]): string | null {
  const { phase } = ctx;
  if (phase.kind === 'drawn' && phase.cardId !== undefined && phase.cardId !== cardId) {
    return 'You may only place the card you drew.';
  }
  if (phase.kind === 'placed') {
    if (phase.chain === null) return 'Your first card has no number, so you cannot add more cards this turn.';
    if (card(cardId).num !== phase.chain) return `You can only add more ${phase.chain}s this turn.`;
  }
  if (phase.kind !== 'play' && phase.kind !== 'drawn' && phase.kind !== 'placed') return 'You cannot place a card now.';
  if (facingPenalty(ctx, playerId) && placementPower(ctx.board, cardId, covers) !== 'spike') {
    return `Answer the Spike by matching a Spike face, or take ${ctx.penalty!.count} cards.`;
  }
  return null;
}

/** Can `playerId` place `cardId` anywhere right now? */
export function canPlaceCard(ctx: TurnContext, playerId: string, cardId: number, radius: number): boolean {
  return placementOptions(ctx.board, cardId, radius).some(
    (o) => o.check.ok && turnRule(ctx, playerId, cardId, o.check.covers) === null,
  );
}

/** Is the current player holding at least one card that can be placed right now? */
export function canPlace(s: GameState): boolean {
  const player = s.players[s.current]!;
  return player.hand.some((id) => canPlaceCard(s, player.id, id, s.config.radius));
}

function place(s: GameState, cardId: number, at: Vec): string | null {
  const player = s.players[s.current]!;
  if (!player.hand.includes(cardId)) return 'That card is not in your hand.';
  const check = checkPlacement(s.board, cardId, at, s.config.radius);
  if (!check.ok) return `Illegal placement (${check.reason}).`;
  const rule = turnRule(s, player.id, cardId, check.covers);
  if (rule) return rule;

  player.hand.splice(player.hand.indexOf(cardId), 1);
  s.board.push({ cardId, at });
  s.passes = 0;
  s.turn.placed++;
  const placed = card(cardId);
  s.log.push(`${player.name} places ${cardName(placed)}.`);

  if (player.hand.length === 0) {
    endRound(s, player.id);
    return null;
  }

  const prefix = placed.special === 'mirror' ? 'Mirror copies ' : '';
  switch (placementPower(s.board, cardId, check.covers)) {
    case 'ring':
      if (s.players.length === 2) {
        s.turn.skips++;
        s.log.push(`${prefix}Ring: the opponent is skipped.`);
      } else {
        s.direction = s.direction === 1 ? -1 : 1;
        s.log.push(`${prefix}Ring: play reverses.`);
      }
      break;
    case 'spike': {
      const count = (s.penalty?.count ?? 0) + SPIKE_PENALTY;
      s.penalty = { count, from: player.id };
      s.log.push(`${prefix}Spike: the next player must answer with a Spike or take ${count} cards.`);
      break;
    }
    case 'block':
      s.turn.skips++;
      s.log.push(`${prefix}Block: the next player is skipped.`);
      break;
    case 'star':
      s.turn.again = true;
      s.log.push(`${prefix}Star: ${player.name} plays again.`);
      break;
    case null:
      break;
  }

  if (check.covers.length >= 2) {
    s.turn.discards++;
    s.log.push(`Combo! ${player.name} may discard a card.`);
  }
  // Only the first card of a turn sets the number for the rest.
  const chain = s.phase.kind === 'placed' ? s.phase.chain : placed.num;
  s.phase = { kind: 'placed', chain };
  return null;
}

function endTurn(s: GameState): string | null {
  const player = s.players[s.current]!;
  let passing = false;
  if (s.phase.kind === 'play') {
    if (facingPenalty(s, player.id)) return `Answer the Spike or take ${s.penalty!.count} cards.`;
    if (s.deck.length + s.discard.length > 0) return 'Place a card or draw one first.';
    if (canPlace(s)) return 'You can still place a card.';
    passing = true;
  }

  // Ending a turn on one card without calling it costs a card, every time.
  if (s.owesCall || (player.hand.length === 1 && !s.called.includes(player.id))) {
    s.owesCall = true;
    drawCard(s, s.current);
    s.log.push(`${player.name} forgot to call Last card and draws 1.`);
    return null;
  }

  if (passing) {
    s.passes++;
    s.log.push(`${player.name} passes.`);
    if (s.passes >= s.players.length) {
      endRound(s, null);
      return null;
    }
  }
  if (!s.turn.again) s.current = step(s, 1 + s.turn.skips);
  s.turn = freshTurn();
  s.phase = { kind: 'play' };
  return null;
}

function lastCard(s: GameState, playerId: string): string | null {
  const index = s.players.findIndex((p) => p.id === playerId);
  const player = s.players[index];
  if (!player) return 'Unknown player.';
  if (index === s.current && s.owesCall) {
    s.owesCall = false;
    s.log.push(`${player.name} calls Last card.`);
    return null;
  }
  if (player.hand.length === 1) {
    if (s.called.includes(playerId)) return 'You already called Last card.';
    s.called.push(playerId);
    s.log.push(`${player.name} calls Last card!`);
    return null;
  }
  drawCard(s, index);
  s.log.push(`${player.name} called Last card at the wrong time and draws 1.`);
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
  // Anyone may call "Last card" at any time.
  if (move.type === 'lastCard') return lastCard(s, playerId);
  const player = s.players[s.current]!;
  if (player.id !== playerId) return 'It is not your turn.';

  switch (move.type) {
    case 'place':
      return place(s, move.cardId, move.at);

    case 'draw': {
      if (phase.kind !== 'play') return 'You cannot draw now.';
      if (facingPenalty(s, player.id)) {
        const { count } = s.penalty!;
        let drawn = 0;
        while (drawn < count && drawCard(s, s.current) !== undefined) drawn++;
        s.penalty = null;
        s.passes = 0;
        s.log.push(`${player.name} takes ${drawn} cards.`);
        s.phase = { kind: 'done' };
        return null;
      }
      const id = drawCard(s, s.current);
      if (id === undefined) return 'There is nothing left to draw.';
      s.passes = 0;
      s.log.push(`${player.name} draws a card.`);
      s.phase = canPlaceCard({ ...s, phase: { kind: 'drawn', cardId: id } }, player.id, id, s.config.radius)
        ? { kind: 'drawn', cardId: id }
        : { kind: 'done' };
      return null;
    }

    case 'discard':
      if (phase.kind !== 'placed' || s.turn.discards === 0) return 'There is nothing to discard for.';
      if (!player.hand.includes(move.cardId)) return 'That card is not in your hand.';
      player.hand.splice(player.hand.indexOf(move.cardId), 1);
      s.discard.push(move.cardId);
      s.turn.discards--;
      s.log.push(`${player.name} discards ${cardName(card(move.cardId))}.`);
      if (player.hand.length === 0) endRound(s, player.id);
      return null;

    case 'endTurn':
      return endTurn(s);

    default:
      // Moves can arrive from the network, so the type is not guaranteed.
      return 'Unknown move.';
  }
}

/** Apply a move without mutating the input state. */
export function applyMove(state: GameState, playerId: string, move: Move): MoveResult {
  const next = structuredClone(state);
  const error = apply(next, playerId, move);
  if (error) return { ok: false, error };
  // A "Last card" call only lasts while that player holds exactly one card.
  next.called = next.called.filter((id) => next.players.find((p) => p.id === id)?.hand.length === 1);
  return { ok: true, state: next };
}

/** The turn phase as one player sees it: a drawn card is only identified to the player who drew it. */
export type PublicPhase = Exclude<Phase, { kind: 'drawn' }> | { kind: 'drawn'; cardId?: number };

/** What one player is allowed to see: their own hand, everyone else's hand size. */
export interface PlayerView extends Omit<GameState, 'players' | 'deck' | 'seed' | 'phase'> {
  me: string;
  phase: PublicPhase;
  players: (Omit<PlayerState, 'hand'> & { handCount: number; hand?: number[] })[];
  deckCount: number;
}

export function playerView(state: GameState, playerId: string): PlayerView {
  const { players, deck, seed: _seed, phase, ...rest } = state;
  const drawer = players[state.current]?.id;
  return {
    ...structuredClone(rest),
    me: playerId,
    phase: phase.kind === 'drawn' && drawer !== playerId ? { kind: 'drawn' } : { ...phase },
    players: players.map(({ hand, ...p }) => ({
      ...p,
      handCount: hand.length,
      ...(p.id === playerId ? { hand: [...hand] } : {}),
    })),
    deckCount: deck.length,
  };
}
