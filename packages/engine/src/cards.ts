import type { Surface } from './geometry.ts';

export const COLORS = ['red', 'blue', 'green', 'gold'] as const;
export const NUMBERS = [1, 2, 3, 4] as const;
export const SHAPES = ['ring', 'spike', 'block', 'star'] as const;

export type Color = (typeof COLORS)[number];
export type CardNumber = (typeof NUMBERS)[number];
export type Shape = (typeof SHAPES)[number];

export interface Card {
  id: number;
  color: Color;
  num: CardNumber;
  shape: Shape;
}

/** One card per color × number × shape, 64 in total. Card ids are indexes into this array. */
export const DECK: readonly Card[] = COLORS.flatMap((color) =>
  NUMBERS.flatMap((num) => SHAPES.map((shape) => ({ color, num, shape }))),
).map((c, id) => ({ id, ...c }));

export const card = (id: number): Card => {
  const c = DECK[id];
  if (!c) throw new Error(`Unknown card id ${id}`);
  return c;
};

/** Does `placed` match `covered` on the given surface of `covered`? */
export function matches(placed: Card, covered: Card, surface: Surface): boolean {
  switch (surface) {
    case 'top':
      return placed.color === covered.color;
    case 'side':
      return placed.num === covered.num;
    case 'face':
      return placed.shape === covered.shape;
  }
}

export const cardName = (c: Card): string => `${c.color} ${c.num} ${c.shape}`;
