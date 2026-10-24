/**
 * Board geometry.
 *
 * The board is a triangular lattice. A lattice vertex is (a, b), with
 * screen position a·e1 + b·e2 where e1 points 30° up-right and e2 points
 * straight up. A card is the hexagon made of the 6 triangles around one
 * vertex (its "center"). Seen as an isometric cube, those triangles pair up
 * into three rhombus surfaces: top, side (right) and face (left).
 *
 * A later card covers triangles of earlier cards; whatever card was placed
 * last on a triangle is the one visible there.
 */

export interface Vec {
  a: number;
  b: number;
}

export type Surface = 'top' | 'side' | 'face';

/** Neighbor directions, counter-clockwise starting at 30°. */
export const DIRS: readonly Vec[] = [
  { a: 1, b: 0 }, // 30°
  { a: 0, b: 1 }, // 90°
  { a: -1, b: 1 }, // 150°
  { a: -1, b: 0 }, // 210°
  { a: 0, b: -1 }, // 270°
  { a: 1, b: -1 }, // 330°
];

/** Triangle k of a hexagon lies between DIRS[k] and DIRS[k+1]. */
export const TRIANGLE_SURFACE: readonly Surface[] = ['top', 'top', 'face', 'face', 'side', 'side'];

/**
 * To fully cover a surface, a new card must be centered on that surface's
 * outer vertex: straight up for top, down-right for side, left for face.
 */
export const COVER_OFFSET: Readonly<Record<Surface, Vec>> = {
  top: DIRS[1]!,
  side: DIRS[5]!,
  face: DIRS[3]!,
};

export const add = (p: Vec, q: Vec): Vec => ({ a: p.a + q.a, b: p.b + q.b });
export const eq = (p: Vec, q: Vec): boolean => p.a === q.a && p.b === q.b;
export const vkey = (p: Vec): string => `${p.a},${p.b}`;

/** Lattice distance from the origin, in steps. */
export const distance = (p: Vec): number => (Math.abs(p.a) + Math.abs(p.b) + Math.abs(p.a + p.b)) / 2;

/**
 * Stable key for a lattice triangle: the sum of its three vertices, which is
 * three times its centroid and therefore unique per triangle.
 */
export function triangleKeys(center: Vec): string[] {
  const keys: string[] = [];
  for (let k = 0; k < 6; k++) {
    const p = DIRS[k]!;
    const q = DIRS[(k + 1) % 6]!;
    keys.push(`${3 * center.a + p.a + q.a},${3 * center.b + p.b + q.b}`);
  }
  return keys;
}

/** Screen position of a lattice point for edge length `size` (y grows downward). */
export function toPixel(p: Vec, size: number): { x: number; y: number } {
  return { x: p.a * (Math.sqrt(3) / 2) * size, y: -(p.a / 2 + p.b) * size };
}

/** A card center is on the board if all of its corners are within `radius`. */
export const insideBoard = (center: Vec, radius: number): boolean => distance(center) <= radius - 1;
