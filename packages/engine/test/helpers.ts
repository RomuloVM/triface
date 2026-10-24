import { DECK, type Color, type Shape } from '../src/index.ts';

/** Card id for a color × number × shape. */
export const id = (color: Color, num: number, shape: Shape): number =>
  DECK.find((c) => c.color === color && c.num === num && c.shape === shape)!.id;

/** Card id of the Mirror of a color. */
export const mirror = (color: Color): number => DECK.find((c) => c.special === 'mirror' && c.color === color)!.id;

/** Card id of the first Bridge. */
export const BRIDGE = DECK.find((c) => c.special === 'bridge')!.id;
