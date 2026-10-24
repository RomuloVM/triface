import { describe, expect, it } from 'vitest';
import {
  COVER_OFFSET,
  applyMove,
  createGame,
  legalPlacements,
  playerView,
  type GameState,
  type Move,
} from '../src/index.ts';
import { id } from './helpers.ts';

const PLAYERS = [
  { id: 'p1', name: 'Ana' },
  { id: 'p2', name: 'Bo' },
  { id: 'p3', name: 'Cy' },
];

/** A 3-player game with a known board (red 1 ring at the center) and known hands. */
function scenario(hands: number[][], deck: number[] = []): GameState {
  const s = createGame(PLAYERS, 1);
  s.board = [{ cardId: id('red', 1, 'ring'), at: { a: 0, b: 0 } }];
  s.players.forEach((p, i) => (p.hand = [...(hands[i] ?? [])]));
  s.deck = deck;
  s.discard = [];
  s.current = 0;
  return s;
}

function play(s: GameState, playerId: string, move: Move): GameState {
  const r = applyMove(s, playerId, move);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

const filler = [id('gold', 4, 'block'), id('gold', 4, 'spike')];

describe('setup', () => {
  it('deals hands, starts the board and is deterministic', () => {
    const a = createGame(PLAYERS, 42);
    expect(a.players.map((p) => p.hand.length)).toEqual([6, 6, 6]);
    expect(a.board).toHaveLength(1);
    expect(a.deck).toHaveLength(64 - 18 - 1);
    expect(createGame(PLAYERS, 42)).toEqual(a);
    expect(createGame(PLAYERS, 43).deck).not.toEqual(a.deck);
  });

  it('deals 5 cards with 5 or more players', () => {
    const five = [...PLAYERS, { id: 'p4', name: 'Di' }, { id: 'p5', name: 'Ed' }];
    expect(createGame(five, 1).players.every((p) => p.hand.length === 5)).toBe(true);
  });
});

describe('turns', () => {
  it('only lets the current player move and does not mutate the input', () => {
    const s = scenario([[id('red', 3, 'star'), ...filler], filler, filler]);
    expect(applyMove(s, 'p2', { type: 'draw' })).toEqual({ ok: false, error: 'It is not your turn.' });
    const before = structuredClone(s);
    play(s, 'p1', { type: 'place', cardId: id('red', 3, 'star'), at: COVER_OFFSET.top });
    expect(s).toEqual(before);
  });

  it('passes the turn after a plain placement', () => {
    const s = play(scenario([[id('red', 3, 'star'), ...filler], filler, filler]), 'p1', {
      type: 'place',
      cardId: id('red', 3, 'star'),
      at: COVER_OFFSET.top,
    });
    expect(s.players[0]!.hand).toEqual(filler);
    expect(s.current).toBe(1);
  });

  it('keeps a drawn playable card pending, and moves on after an unplayable draw', () => {
    const playable = play(scenario([filler, filler, filler], [id('red', 2, 'block')]), 'p1', { type: 'draw' });
    expect(playable.phase).toEqual({ kind: 'drawn', cardId: id('red', 2, 'block') });
    expect(applyMove(playable, 'p1', { type: 'place', cardId: filler[0]!, at: COVER_OFFSET.top }).ok).toBe(false);
    expect(play(playable, 'p1', { type: 'pass' }).current).toBe(1);

    const dud = play(scenario([filler, filler, filler], [id('blue', 3, 'star')]), 'p1', { type: 'draw' });
    expect(dud.current).toBe(1);
    expect(dud.players[0]!.hand).toHaveLength(3);
  });

  it('only allows passing when there is nothing to draw and nothing to place', () => {
    expect(applyMove(scenario([filler, filler, filler], [1]), 'p1', { type: 'pass' }).ok).toBe(false);
    expect(applyMove(scenario([[id('red', 2, 'block')], filler, filler]), 'p1', { type: 'pass' }).ok).toBe(false);
    let s = scenario([filler, filler, filler]);
    s = play(s, 'p1', { type: 'pass' });
    s = play(s, 'p2', { type: 'pass' });
    s = play(s, 'p3', { type: 'pass' });
    expect(s.phase).toEqual({ kind: 'roundOver', winner: null });
    expect(s.players.map((p) => p.score)).toEqual([8, 8, 8]);
  });
});

describe('shape powers (face matches)', () => {
  // The center card is a ring; matching its face requires a ring.
  const faceMatch = (shapeCard: number) =>
    scenario([[shapeCard, ...filler], filler, filler], [10, 11, 12]);

  it('ring reverses play', () => {
    const s = play(faceMatch(id('blue', 2, 'ring')), 'p1', {
      type: 'place',
      cardId: id('blue', 2, 'ring'),
      at: COVER_OFFSET.face,
    });
    expect(s.direction).toBe(-1);
    expect(s.current).toBe(2);
  });

  it('only triggers on a face match', () => {
    // Red 2 ring placed on top matches color; its ring shape does nothing.
    const s = play(faceMatch(id('red', 2, 'ring')), 'p1', {
      type: 'place',
      cardId: id('red', 2, 'ring'),
      at: COVER_OFFSET.top,
    });
    expect(s.direction).toBe(1);
    expect(s.current).toBe(1);
  });

  it('spike, block and star resolve against a shape-matched board', () => {
    const board = (shape: 'spike' | 'block' | 'star') => {
      const s = faceMatch(id('blue', 2, shape));
      s.board = [{ cardId: id('red', 1, shape), at: { a: 0, b: 0 } }];
      return play(s, 'p1', { type: 'place', cardId: id('blue', 2, shape), at: COVER_OFFSET.face });
    };
    const spike = board('spike');
    expect(spike.players.map((p) => p.hand.length)).toEqual([2, 3, 3]);
    expect(board('block').current).toBe(2);
    const star = board('star');
    expect(star.current).toBe(0);
    expect(star.phase).toEqual({ kind: 'play' });
  });
});

describe('combos and round end', () => {
  function comboState(hand: number[]): GameState {
    const s = scenario([hand, filler, filler]);
    s.board.push({ cardId: id('blue', 2, 'spike'), at: { a: 1, b: 1 } });
    return s;
  }
  const comboCard = id('red', 3, 'spike');

  it('lets the player discard after covering two surfaces', () => {
    let s = play(comboState([comboCard, ...filler]), 'p1', { type: 'place', cardId: comboCard, at: { a: 0, b: 1 } });
    expect(s.phase.kind).toBe('comboDiscard');
    s = play(s, 'p1', { type: 'discard', cardId: filler[0]! });
    expect(s.players[0]!.hand).toEqual([filler[1]]);
    expect(s.discard).toEqual([filler[0]]);
    expect(s.current).toBe(1);
  });

  it('ends the round when a hand empties and scores the rest', () => {
    const s = play(comboState([comboCard]), 'p1', { type: 'place', cardId: comboCard, at: { a: 0, b: 1 } });
    expect(s.phase).toEqual({ kind: 'roundOver', winner: 'p1' });
    expect(s.players.map((p) => p.score)).toEqual([0, 8, 8]);
    const next = play(s, 'p2', { type: 'nextRound' });
    expect(next.round).toBe(2);
    expect(next.players.map((p) => p.hand.length)).toEqual([6, 6, 6]);
  });

  it('ends the match at the target score', () => {
    const s = comboState([comboCard]);
    s.players[1]!.score = 20;
    const over = play(s, 'p1', { type: 'place', cardId: comboCard, at: { a: 0, b: 1 } });
    expect(over.phase).toEqual({ kind: 'gameOver', winner: 'p1' });
  });
});

describe('untrusted input', () => {
  it('rejects unknown move types', () => {
    const s = createGame(PLAYERS, 1);
    const r = applyMove(s, s.players[s.current]!.id, { type: 'teleport' } as unknown as Move);
    expect(r).toEqual({ ok: false, error: 'Unknown move.' });
  });
});

describe('player view', () => {
  it('only tells the drawing player which card they drew', () => {
    const drawn = play(scenario([filler, filler, filler], [id('red', 2, 'block')]), 'p1', { type: 'draw' });
    expect(playerView(drawn, 'p1').phase).toEqual({ kind: 'drawn', cardId: id('red', 2, 'block') });
    expect(playerView(drawn, 'p2').phase).toEqual({ kind: 'drawn' });
  });

  it('hides other hands and the deck order', () => {
    const s = createGame(PLAYERS, 7);
    const view = playerView(s, 'p2');
    expect(view.players[1]!.hand).toEqual(s.players[1]!.hand);
    expect(view.players[0]!.hand).toBeUndefined();
    expect(view.players[0]!.handCount).toBe(6);
    expect(view).not.toHaveProperty('deck');
    expect(view).not.toHaveProperty('seed');
  });
});

describe('random play', () => {
  const total = (s: GameState) =>
    s.deck.length + s.discard.length + s.board.length + s.players.reduce((n, p) => n + p.hand.length, 0);

  it.each([2, 3, 4, 5, 6])('keeps all 64 cards accounted for with %i players', (count) => {
    const players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    for (let seed = 1; seed <= 20; seed++) {
      let s = createGame(players, seed);
      let rng = seed;
      const pick = <T>(xs: T[]): T => xs[(rng = (rng * 1103515245 + 12345) % 2147483648) % xs.length]!;
      for (let turn = 0; turn < 5000 && s.phase.kind !== 'gameOver'; turn++) {
        const me = s.players[s.current]!;
        const moves: Move[] = [];
        if (s.phase.kind === 'roundOver') moves.push({ type: 'nextRound' });
        if (s.phase.kind === 'comboDiscard') {
          moves.push({ type: 'skipDiscard' }, ...me.hand.map((cardId) => ({ type: 'discard' as const, cardId })));
        }
        if (s.phase.kind === 'play' || s.phase.kind === 'drawn') {
          const ids = s.phase.kind === 'drawn' ? [s.phase.cardId] : me.hand;
          for (const cardId of ids) {
            for (const at of legalPlacements(s.board, cardId, s.config.radius)) moves.push({ type: 'place', cardId, at });
          }
          moves.push(s.phase.kind === 'drawn' ? { type: 'pass' } : { type: 'draw' }, { type: 'pass' });
        }
        const legal = moves.map((m) => applyMove(s, me.id, m)).filter((r) => r.ok);
        expect(legal.length).toBeGreaterThan(0);
        s = (pick(legal) as { ok: true; state: GameState }).state;
        expect(total(s)).toBe(64);
      }
      expect(s.phase.kind).toBe('gameOver');
    }
  }, 60_000); // 20 full matches per player count
});
