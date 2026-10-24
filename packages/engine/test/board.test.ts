import { describe, expect, it } from 'vitest';
import {
  COVER_OFFSET,
  TRIANGLE_SURFACE,
  checkPlacement,
  legalPlacements,
  openSurfaces,
  triangleKeys,
  type Placement,
} from '../src/index.ts';
import { id } from './helpers.ts';

const O = { a: 0, b: 0 };
const R = 8;

describe('geometry', () => {
  it('gives every card 6 distinct triangles', () => {
    expect(new Set(triangleKeys(O)).size).toBe(6);
  });

  it.each(['top', 'side', 'face'] as const)('covering offset for %s overlaps exactly that surface', (surface) => {
    const mine = triangleKeys(O);
    const theirs = new Set(triangleKeys(COVER_OFFSET[surface]));
    const shared = mine.flatMap((key, k) => (theirs.has(key) ? [TRIANGLE_SURFACE[k]] : []));
    expect(shared).toEqual([surface, surface]);
  });
});

describe('placement', () => {
  const base: Placement[] = [{ cardId: id('red', 1, 'ring'), at: O }];

  it('matches color on top, number on the side and shape on the face', () => {
    expect(legalPlacements(base, id('red', 3, 'star'), R)).toEqual([COVER_OFFSET.top]);
    expect(legalPlacements(base, id('blue', 1, 'star'), R)).toEqual([COVER_OFFSET.side]);
    expect(legalPlacements(base, id('blue', 2, 'ring'), R)).toEqual([COVER_OFFSET.face]);
    expect(legalPlacements(base, id('blue', 2, 'star'), R)).toEqual([]);
  });

  it('rejects mismatches, half-covered surfaces, occupied spots and the board edge', () => {
    expect(checkPlacement(base, id('blue', 2, 'star'), COVER_OFFSET.top, R)).toEqual({ ok: false, reason: 'mismatch' });
    expect(checkPlacement(base, id('red', 2, 'star'), { a: 1, b: 0 }, R)).toEqual({ ok: false, reason: 'partial' });
    expect(checkPlacement(base, id('red', 2, 'star'), O, R)).toEqual({ ok: false, reason: 'occupied' });
    expect(checkPlacement(base, id('red', 2, 'star'), { a: 0, b: 9 }, R)).toEqual({ ok: false, reason: 'off-board' });
    expect(checkPlacement(base, id('red', 2, 'star'), { a: 0, b: 4 }, R)).toEqual({ ok: false, reason: 'no-surface' });
  });

  it('closes a surface once it is covered', () => {
    const board = [...base, { cardId: id('red', 3, 'star'), at: COVER_OFFSET.top }];
    const open = openSurfaces(board).filter((s) => s.placement === 0).map((s) => s.surface);
    expect(open).toEqual(['side', 'face']);
  });

  it('treats partly covered surfaces as broken', () => {
    // A card forced onto (1,0) half-covers both the top and the side of the first card.
    const board = [...base, { cardId: id('gold', 4, 'block'), at: { a: 1, b: 0 } }];
    const open = openSurfaces(board).filter((s) => s.placement === 0).map((s) => s.surface);
    expect(open).toEqual(['face']);
  });

  it('reports every surface a combo covers', () => {
    const board: Placement[] = [
      { cardId: id('red', 1, 'ring'), at: O },
      { cardId: id('blue', 2, 'spike'), at: { a: 1, b: 1 } },
    ];
    const check = checkPlacement(board, id('red', 3, 'spike'), { a: 0, b: 1 }, R);
    expect(check.ok && check.covers).toEqual(
      expect.arrayContaining([
        { placement: 0, surface: 'top' },
        { placement: 1, surface: 'face' },
      ]),
    );
    expect(check.ok && check.covers).toHaveLength(2);
    // Matching only one of the two surfaces is not enough.
    expect(checkPlacement(board, id('red', 3, 'star'), { a: 0, b: 1 }, R).ok).toBe(false);
  });
});
