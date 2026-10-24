import type { Surface } from './geometry.ts';

export const COLORS = ['red', 'blue', 'green', 'gold'] as const;
export const NUMBERS = [1, 2, 3, 4] as const;
export const SHAPES = ['ring', 'spike', 'block', 'star'] as const;

export type Color = (typeof COLORS)[number];
export type CardNumber = (typeof NUMBERS)[number];
export type Shape = (typeof SHAPES)[number];

/**
 * Special cards. A Mirror has a color but a blank side and face, which match
 * anything; covering a face, it copies that face's power. A Bridge is blank
 * all over: it matches anything, anything matches it, and it has no power.
 */
export type Special = 'mirror' | 'bridge';

export interface Card {
  /** Index into DECK: the card's design, shared by both copies in a two-deck game. */
  id: number;
  color: Color | null;
  num: CardNumber | null;
  shape: Shape | null;
  special: Special | null;
}

/** Penalty points for a special card left in hand. */
export const SPECIAL_POINTS = 5;

/**
 * One card per color × number × shape (64), then a Mirror per color (4) and
 * 4 Bridges: 72 designs.
 */
export const DECK: readonly Card[] = [
  ...COLORS.flatMap((color) =>
    NUMBERS.flatMap((num) => SHAPES.map((shape) => ({ color, num, shape, special: null }) as const)),
  ),
  ...COLORS.map((color) => ({ color, num: null, shape: null, special: 'mirror' }) as const),
  ...COLORS.map(() => ({ color: null, num: null, shape: null, special: 'bridge' }) as const),
].map((c, id) => ({ id, ...c }));

/** Games with many players shuffle two decks together. */
export const MAX_COPIES = 2;

/**
 * Card ids are unique per physical card: id = copy × DECK.length + design.
 * The largest id in a two-deck game:
 */
export const MAX_CARD_ID = DECK.length * MAX_COPIES - 1;

/** Every card id in a game played with `copies` decks. */
export const cardIds = (copies: number): number[] =>
  Array.from({ length: DECK.length * copies }, (_, id) => id);

export const card = (id: number): Card => {
  const c = Number.isInteger(id) && id >= 0 && id <= MAX_CARD_ID ? DECK[id % DECK.length] : undefined;
  if (!c) throw new Error(`Unknown card id ${id}`);
  return c;
};

/** Does `placed` match `covered` on the given surface of `covered`? Blank surfaces match anything. */
export function matches(placed: Card, covered: Card, surface: Surface): boolean {
  if (placed.special === 'bridge' || covered.special === 'bridge') return true;
  switch (surface) {
    case 'top':
      return placed.color === covered.color;
    case 'side':
      return placed.num === null || covered.num === null || placed.num === covered.num;
    case 'face':
      return placed.shape === null || covered.shape === null || placed.shape === covered.shape;
  }
}

export const points = (c: Card): number => c.num ?? SPECIAL_POINTS;

export function cardName(c: Card): string {
  if (c.special === 'bridge') return 'bridge';
  if (c.special === 'mirror') return `${c.color} mirror`;
  return `${c.color} ${c.num} ${c.shape}`;
}
