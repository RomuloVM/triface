import { describe, expect, it } from 'vitest';
import {
  COVER_OFFSET,
  DECK,
  applyMove,
  canPlaceCard,
  card,
  createGame,
  matches,
  placementOptions,
  playerView,
  turnRule,
  type GameState,
  type Move,
} from '../src/index.ts';
import { BRIDGE, id, mirror } from './helpers.ts';

const PLAYERS = [
  { id: 'p1', name: 'Ana' },
  { id: 'p2', name: 'Bo' },
  { id: 'p3', name: 'Cy' },
];

/** A 3-player game with a known board (red 1 ring at the center) and known hands. */
function scenario(hands: number[][], deck: number[] = [10, 11, 12, 13, 14, 15]): GameState {
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

const end: Move = { type: 'endTurn' };
const filler = [id('gold', 4, 'block'), id('gold', 4, 'spike')];

describe('setup', () => {
  it('deals hands, starts the board with a regular card and is deterministic', () => {
    const a = createGame(PLAYERS, 42);
    expect(a.players.map((p) => p.hand.length)).toEqual([6, 6, 6]);
    expect(a.board).toHaveLength(1);
    expect(card(a.board[0]!.cardId).special).toBeNull();
    expect(a.deck).toHaveLength(72 - 18 - 1);
    expect(createGame(PLAYERS, 42)).toEqual(a);
    expect(createGame(PLAYERS, 43).deck).not.toEqual(a.deck);
  });

  it('deals 5 cards with 5 or more players', () => {
    const five = [...PLAYERS, { id: 'p4', name: 'Di' }, { id: 'p5', name: 'Ed' }];
    expect(createGame(five, 1).players.every((p) => p.hand.length === 5)).toBe(true);
  });

  it('uses two decks and a bigger board with 7 to 10 players', () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    const s = createGame(ten, 1);
    expect(s.config).toMatchObject({ copies: 2, radius: 10 });
    const all = [...s.deck, ...s.players.flatMap((p) => p.hand), s.board[0]!.cardId];
    expect(all).toHaveLength(2 * DECK.length);
    expect(new Set(all).size).toBe(all.length);
    expect(() => createGame([...ten, { id: 'x', name: 'X' }], 1)).toThrow();
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

  it('ends the turn only when the player presses End turn', () => {
    let s = play(scenario([[id('red', 3, 'star'), ...filler], filler, filler]), 'p1', {
      type: 'place',
      cardId: id('red', 3, 'star'),
      at: COVER_OFFSET.top,
    });
    expect(s.players[0]!.hand).toEqual(filler);
    expect(s.current).toBe(0);
    expect(s.phase).toEqual({ kind: 'placed', chain: 3 });
    s = play(s, 'p1', end);
    expect(s.current).toBe(1);
    expect(s.phase).toEqual({ kind: 'play' });
  });

  it('requires placing or drawing before ending a turn', () => {
    expect(applyMove(scenario([filler, filler, filler]), 'p1', end).ok).toBe(false);
  });

  it('lets a drawn card that fits be placed, and ends after a card that does not', () => {
    const playable = play(scenario([filler, filler, filler], [id('red', 2, 'block')]), 'p1', { type: 'draw' });
    expect(playable.phase).toEqual({ kind: 'drawn', cardId: id('red', 2, 'block') });
    expect(applyMove(playable, 'p1', { type: 'place', cardId: filler[0]!, at: COVER_OFFSET.top }).ok).toBe(false);
    expect(play(playable, 'p1', end).current).toBe(1);

    const dud = play(scenario([filler, filler, filler], [id('blue', 3, 'star')]), 'p1', { type: 'draw' });
    expect(dud.phase).toEqual({ kind: 'done' });
    expect(dud.players[0]!.hand).toHaveLength(3);
    expect(play(dud, 'p1', end).current).toBe(1);
  });

  it('only allows passing when there is nothing to draw and nothing to place', () => {
    expect(applyMove(scenario([[id('red', 2, 'block')], filler, filler], []), 'p1', end).ok).toBe(false);
    let s = scenario([filler, filler, filler], []);
    s = play(s, 'p1', end);
    s = play(s, 'p2', end);
    s = play(s, 'p3', end);
    expect(s.phase).toEqual({ kind: 'roundOver', winner: null });
    expect(s.players.map((p) => p.score)).toEqual([8, 8, 8]);
  });
});

describe('several cards in one turn', () => {
  // Red 3 star on the top of the red 1 ring, then more 3s.
  const first = id('red', 3, 'star');

  it('allows more cards with the same number as the first', () => {
    let s = scenario([[first, id('red', 3, 'block'), ...filler], filler, filler]);
    s = play(s, 'p1', { type: 'place', cardId: first, at: COVER_OFFSET.top });
    // Red 3 block covers the red 3 star's top.
    s = play(s, 'p1', { type: 'place', cardId: id('red', 3, 'block'), at: { a: 0, b: 2 } });
    expect(s.board).toHaveLength(3);
    expect(s.phase).toEqual({ kind: 'placed', chain: 3 });
  });

  it('refuses a card with another number', () => {
    let s = scenario([[first, id('red', 2, 'spike'), ...filler], filler, filler]);
    s = play(s, 'p1', { type: 'place', cardId: first, at: COVER_OFFSET.top });
    const r = applyMove(s, 'p1', { type: 'place', cardId: id('red', 2, 'spike'), at: { a: 0, b: 2 } });
    expect(r).toEqual({ ok: false, error: 'You can only add more 3s this turn.' });
    expect(canPlaceCard(s, 'p1', id('red', 2, 'spike'), 8)).toBe(false);
  });
});

describe('shape powers (face matches)', () => {
  // The center card is a ring; matching its face requires a ring.
  const faceMatch = (shapeCard: number) => scenario([[shapeCard, ...filler], filler, filler]);
  const placeOnFace = (s: GameState, cardId: number) =>
    play(play(s, 'p1', { type: 'place', cardId, at: COVER_OFFSET.face }), 'p1', end);

  it('ring reverses play', () => {
    const s = placeOnFace(faceMatch(id('blue', 2, 'ring')), id('blue', 2, 'ring'));
    expect(s.direction).toBe(-1);
    expect(s.current).toBe(2);
  });

  it('only triggers on a face match', () => {
    // Red 2 ring placed on top matches color; its ring shape does nothing.
    const s = play(
      play(faceMatch(id('red', 2, 'ring')), 'p1', { type: 'place', cardId: id('red', 2, 'ring'), at: COVER_OFFSET.top }),
      'p1',
      end,
    );
    expect(s.direction).toBe(1);
    expect(s.current).toBe(1);
  });

  it('block skips and star plays again', () => {
    const on = (shape: 'block' | 'star') => {
      const s = faceMatch(id('blue', 2, shape));
      s.board = [{ cardId: id('red', 1, shape), at: { a: 0, b: 0 } }];
      return placeOnFace(s, id('blue', 2, shape));
    };
    expect(on('block').current).toBe(2);
    const star = on('star');
    expect(star.current).toBe(0);
    expect(star.phase).toEqual({ kind: 'play' });
  });

  it('a mirror copies the power of the face it covers', () => {
    const s = scenario([[mirror('blue'), ...filler], filler, filler]);
    s.board = [{ cardId: id('red', 1, 'block'), at: { a: 0, b: 0 } }];
    const after = placeOnFace(s, mirror('blue'));
    expect(after.current).toBe(2);
    expect(after.log).toContain('Mirror copies Block: the next player is skipped.');
  });

  it('a bridge fits anywhere but has no power', () => {
    const s = placeOnFace(scenario([[BRIDGE, ...filler], filler, filler]), BRIDGE);
    expect(s.direction).toBe(1);
    expect(s.current).toBe(1);
  });
});

describe('spike penalties', () => {
  const spikeBoard = (hands: number[][], deck?: number[]) => {
    const s = scenario(hands, deck);
    s.board = [{ cardId: id('red', 1, 'spike'), at: { a: 0, b: 0 } }];
    return s;
  };
  const hit = (s: GameState) =>
    play(play(s, 'p1', { type: 'place', cardId: id('blue', 2, 'spike'), at: COVER_OFFSET.face }), 'p1', end);

  it('makes the next player take 2 cards', () => {
    let s = hit(spikeBoard([[id('blue', 2, 'spike'), ...filler], filler, filler]));
    expect(s.penalty).toEqual({ count: 2, from: 'p1' });
    expect(applyMove(s, 'p2', end).ok).toBe(false);
    expect(applyMove(s, 'p2', { type: 'place', cardId: filler[0]!, at: { a: 0, b: 1 } }).ok).toBe(false);
    s = play(s, 'p2', { type: 'draw' });
    expect(s.players[1]!.hand).toHaveLength(4);
    expect(s.penalty).toBeNull();
    expect(s.phase).toEqual({ kind: 'done' });
    expect(play(s, 'p2', end).current).toBe(2);
  });

  it('stacks when answered with another spike', () => {
    let s = hit(spikeBoard([[id('blue', 2, 'spike'), ...filler], [id('green', 3, 'spike'), ...filler], filler]));
    // The blue 2 spike now sits at the face spot; answer on its face.
    const face = { a: 2 * COVER_OFFSET.face.a, b: 2 * COVER_OFFSET.face.b };
    s = play(play(s, 'p2', { type: 'place', cardId: id('green', 3, 'spike'), at: face }), 'p2', end);
    expect(s.penalty).toEqual({ count: 4, from: 'p2' });
    expect(s.current).toBe(2);
    s = play(s, 'p3', { type: 'draw' });
    expect(s.players[2]!.hand).toHaveLength(6);
  });

  it('explains what the target must do', () => {
    const s = hit(spikeBoard([[id('blue', 2, 'spike'), ...filler], [id('red', 3, 'star'), ...filler], filler]));
    const top = placementOptions(s.board, id('red', 3, 'star'), 8).find((o) => o.check.ok)!;
    expect(turnRule(s, 'p2', id('red', 3, 'star'), top.check.ok ? top.check.covers : [])).toBe(
      'Answer the Spike by matching a Spike face, or take 2 cards.',
    );
  });
});

describe('combos and round end', () => {
  function comboState(hand: number[]): GameState {
    const s = scenario([hand, filler, filler]);
    s.board.push({ cardId: id('blue', 2, 'spike'), at: { a: 1, b: 1 } });
    return s;
  }
  const comboCard = id('red', 3, 'spike');

  it('lets the player discard once after covering two surfaces', () => {
    let s = play(comboState([comboCard, ...filler]), 'p1', { type: 'place', cardId: comboCard, at: { a: 0, b: 1 } });
    expect(s.turn.discards).toBe(1);
    s = play(s, 'p1', { type: 'discard', cardId: filler[0]! });
    expect(s.players[0]!.hand).toEqual([filler[1]]);
    expect(s.discard).toEqual([filler[0]]);
    expect(applyMove(s, 'p1', { type: 'discard', cardId: filler[1]! }).ok).toBe(false);
  });

  it('ends the round when a hand empties and scores the rest', () => {
    const s = play(comboState([comboCard]), 'p1', { type: 'place', cardId: comboCard, at: { a: 0, b: 1 } });
    expect(s.phase).toEqual({ kind: 'roundOver', winner: 'p1' });
    expect(s.players.map((p) => p.score)).toEqual([0, 8, 8]);
    const next = play(s, 'p2', { type: 'nextRound' });
    expect(next.round).toBe(2);
    expect(next.players.map((p) => p.hand.length)).toEqual([6, 6, 6]);
  });

  it('counts special cards as 5 points', () => {
    const t = comboState([comboCard]);
    t.players[1]!.hand = [BRIDGE, mirror('red')];
    expect(play(t, 'p1', { type: 'place', cardId: comboCard, at: { a: 0, b: 1 } }).players[1]!.score).toBe(10);
  });

  it('ends the match at the target score', () => {
    const s = comboState([comboCard]);
    s.players[1]!.score = 20;
    const over = play(s, 'p1', { type: 'place', cardId: comboCard, at: { a: 0, b: 1 } });
    expect(over.phase).toEqual({ kind: 'gameOver', winner: 'p1' });
  });
});

describe('last card', () => {
  const twoLeft = () => scenario([[id('red', 3, 'star'), filler[0]!], filler, filler]);
  const placeOne = (s: GameState) => play(s, 'p1', { type: 'place', cardId: id('red', 3, 'star'), at: COVER_OFFSET.top });

  it('lets a player with one card call it and end the turn', () => {
    let s = play(placeOne(twoLeft()), 'p1', { type: 'lastCard' });
    expect(s.called).toEqual(['p1']);
    s = play(s, 'p1', end);
    expect(s.current).toBe(1);
    expect(s.players[0]!.hand).toHaveLength(1);
  });

  it('adds a card each time the turn is ended without calling', () => {
    let s = play(placeOne(twoLeft()), 'p1', end);
    expect(s.current).toBe(0);
    expect(s.players[0]!.hand).toHaveLength(2);
    expect(s.owesCall).toBe(true);
    s = play(s, 'p1', end);
    expect(s.current).toBe(0);
    expect(s.players[0]!.hand).toHaveLength(3);
    s = play(s, 'p1', { type: 'lastCard' });
    expect(s.owesCall).toBe(false);
    s = play(s, 'p1', end);
    expect(s.current).toBe(1);
    expect(s.players[0]!.hand).toHaveLength(3);
  });

  it('costs a card when called at the wrong time, by anyone', () => {
    const s = play(twoLeft(), 'p3', { type: 'lastCard' });
    expect(s.players[2]!.hand).toHaveLength(3);
    expect(s.current).toBe(0);
  });

  it('can be called off-turn while holding one card, and lapses when the hand grows', () => {
    let s = scenario([[id('red', 3, 'star'), ...filler], [filler[0]!], filler]);
    s = play(s, 'p2', { type: 'lastCard' });
    expect(s.called).toEqual(['p2']);
    expect(applyMove(s, 'p2', { type: 'lastCard' }).ok).toBe(false);
    s.players[1]!.hand.push(filler[1]!);
    s = play(s, 'p1', { type: 'draw' });
    expect(s.called).toEqual([]);
  });
});

describe('special cards', () => {
  const red3 = card(id('red', 3, 'star'));
  it('blank surfaces match anything', () => {
    expect(matches(card(BRIDGE), red3, 'top')).toBe(true);
    expect(matches(red3, card(BRIDGE), 'side')).toBe(true);
    expect(matches(card(mirror('blue')), red3, 'face')).toBe(true);
    expect(matches(card(mirror('blue')), red3, 'side')).toBe(true);
    expect(matches(card(mirror('blue')), red3, 'top')).toBe(false);
    expect(matches(card(mirror('red')), red3, 'top')).toBe(true);
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

  it.each([2, 3, 6, 7, 10])('keeps every card accounted for with %i players', (count) => {
    const players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    for (let seed = 1; seed <= 12; seed++) {
      let s = createGame(players, seed);
      const cards = total(s);
      let rng = seed;
      // Use the high bits: the low bits of this generator repeat with a short period.
      const pick = <T>(xs: T[]): T => {
        rng = (rng * 1103515245 + 12345) % 2147483648;
        return xs[Math.floor((rng / 2147483648) * xs.length)]!;
      };
      for (let turn = 0; turn < 20000 && s.phase.kind !== 'gameOver'; turn++) {
        const me = s.players[s.current]!;
        const moves: Move[] = [];
        if (s.phase.kind === 'roundOver') moves.push({ type: 'nextRound' });
        else {
          const ids = s.phase.kind === 'drawn' ? [s.phase.cardId] : me.hand;
          for (const cardId of ids) {
            for (const o of placementOptions(s.board, cardId, s.config.radius)) {
              if (o.check.ok) moves.push({ type: 'place', cardId, at: o.at });
            }
          }
          moves.push({ type: 'draw' }, end, ...me.hand.map((cardId) => ({ type: 'discard' as const, cardId })));
          // Players usually remember to call; sometimes they forget or call wrongly.
          if (me.hand.length === 1 || s.owesCall || pick([0, 0, 0, 0, 1])) moves.push({ type: 'lastCard' });
        }
        // Try moves in random order, placing first most of the time, until one is legal.
        const order = moves.map((m) => ({ m, key: (m.type === 'place' ? 0 : 1) * pick([0, 1, 1, 1, 1]) + pick([0, 0.5]) }));
        order.sort((x, y) => x.key - y.key);
        const next = order.map(({ m }) => m).find((m) => applyMove(s, me.id, m).ok);
        expect(next).toBeDefined();
        s = play(s, me.id, next!);
        expect(total(s)).toBe(cards);
      }
      expect(s.phase.kind).toBe('gameOver');
    }
  }, 120_000);
});
