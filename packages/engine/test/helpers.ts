import { DECK, type Color, type Shape } from '../src/index.ts';

/** Card id for a color × number × shape. */
export const id = (color: Color, num: number, shape: Shape): number =>
  DECK.find((c) => c.color === color && c.num === num && c.shape === shape)!.id;
