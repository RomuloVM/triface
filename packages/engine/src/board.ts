import { card, matches } from './cards.ts';
import {
  COVER_OFFSET,
  TRIANGLE_SURFACE,
  add,
  eq,
  insideBoard,
  triangleKeys,
  vkey,
  type Surface,
  type Vec,
} from './geometry.ts';

export interface Placement {
  cardId: number;
  at: Vec;
}

/** An open surface of a placed card; `placement` indexes the board's placement list. */
export interface SurfaceRef {
  placement: number;
  surface: Surface;
}

export type PlacementCheck =
  | { ok: true; covers: SurfaceRef[] }
  | { ok: false; reason: 'off-board' | 'occupied' | 'partial' | 'mismatch' | 'no-surface' };

const SURFACES: readonly Surface[] = ['top', 'side', 'face'];

/** Which placement (and which of its surfaces) is visible on each triangle. */
export function visibility(placements: readonly Placement[]): Map<string, SurfaceRef> {
  const top = new Map<string, SurfaceRef>();
  placements.forEach((p, placement) => {
    triangleKeys(p.at).forEach((key, k) => top.set(key, { placement, surface: TRIANGLE_SURFACE[k]! }));
  });
  return top;
}

const refKey = (r: SurfaceRef) => `${r.placement}:${r.surface}`;

/** Count of visible triangles per placement surface (2 means fully open). */
function visibleCounts(vis: Map<string, SurfaceRef>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ref of vis.values()) counts.set(refKey(ref), (counts.get(refKey(ref)) ?? 0) + 1);
  return counts;
}

/** Surfaces that are still completely visible. */
export function openSurfaces(placements: readonly Placement[]): SurfaceRef[] {
  const counts = visibleCounts(visibility(placements));
  const open: SurfaceRef[] = [];
  placements.forEach((_, placement) => {
    for (const surface of SURFACES) {
      if (counts.get(refKey({ placement, surface })) === 2) open.push({ placement, surface });
    }
  });
  return open;
}

/** Check whether `cardId` may be placed with its center at `at`. */
export function checkPlacement(
  placements: readonly Placement[],
  cardId: number,
  at: Vec,
  radius: number,
): PlacementCheck {
  if (!insideBoard(at, radius)) return { ok: false, reason: 'off-board' };
  if (placements.some((p) => eq(p.at, at))) return { ok: false, reason: 'occupied' };

  const vis = visibility(placements);
  const counts = visibleCounts(vis);
  const touched = new Map<string, { ref: SurfaceRef; covered: number }>();
  for (const key of triangleKeys(at)) {
    const ref = vis.get(key);
    if (!ref) continue;
    const entry = touched.get(refKey(ref)) ?? { ref, covered: 0 };
    entry.covered++;
    touched.set(refKey(ref), entry);
  }

  const placed = card(cardId);
  const covers: SurfaceRef[] = [];
  for (const [key, { ref, covered }] of touched) {
    // Broken surfaces (already partly covered) may be covered freely.
    if (counts.get(key) !== 2) continue;
    if (covered < 2) return { ok: false, reason: 'partial' };
    if (!matches(placed, card(placements[ref.placement]!.cardId), ref.surface)) {
      return { ok: false, reason: 'mismatch' };
    }
    covers.push(ref);
  }
  if (covers.length === 0) return { ok: false, reason: 'no-surface' };
  return { ok: true, covers };
}

/** Every center where `cardId` could legally be placed. */
export function legalPlacements(placements: readonly Placement[], cardId: number, radius: number): Vec[] {
  const seen = new Set<string>();
  const result: Vec[] = [];
  for (const ref of openSurfaces(placements)) {
    // A surface can only be fully covered by a card centered on its outer vertex.
    const at = add(placements[ref.placement]!.at, COVER_OFFSET[ref.surface]);
    if (seen.has(vkey(at))) continue;
    seen.add(vkey(at));
    if (checkPlacement(placements, cardId, at, radius).ok) result.push(at);
  }
  return result;
}
