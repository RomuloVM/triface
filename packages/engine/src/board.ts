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

/** How a card placed somewhere would touch an open surface. */
export interface SurfaceTouch {
  ref: SurfaceRef;
  /** `partial`: only one of the surface's two triangles would be covered. */
  status: 'match' | 'mismatch' | 'partial';
}

/** The open surfaces a card centered at `at` would cover, fully or in part. */
export function surfaceTouches(
  placements: readonly Placement[],
  cardId: number,
  at: Vec,
  vis = visibility(placements),
  counts = visibleCounts(vis),
): SurfaceTouch[] {
  const touched = new Map<string, { ref: SurfaceRef; covered: number }>();
  for (const key of triangleKeys(at)) {
    const ref = vis.get(key);
    if (!ref) continue;
    const entry = touched.get(refKey(ref)) ?? { ref, covered: 0 };
    entry.covered++;
    touched.set(refKey(ref), entry);
  }

  const placed = card(cardId);
  const touches: SurfaceTouch[] = [];
  for (const [key, { ref, covered }] of touched) {
    // Broken surfaces (already partly covered) may be covered freely.
    if (counts.get(key) !== 2) continue;
    let status: SurfaceTouch['status'] = 'partial';
    if (covered === 2) {
      status = matches(placed, card(placements[ref.placement]!.cardId), ref.surface) ? 'match' : 'mismatch';
    }
    touches.push({ ref, status });
  }
  return touches;
}

/** Check whether `cardId` may be placed with its center at `at`. */
export function checkPlacement(
  placements: readonly Placement[],
  cardId: number,
  at: Vec,
  radius: number,
): PlacementCheck {
  return judge(placements, at, radius, surfaceTouches(placements, cardId, at));
}

function judge(placements: readonly Placement[], at: Vec, radius: number, touches: SurfaceTouch[]): PlacementCheck {
  if (!insideBoard(at, radius)) return { ok: false, reason: 'off-board' };
  if (placements.some((p) => eq(p.at, at))) return { ok: false, reason: 'occupied' };
  if (touches.some((t) => t.status === 'partial')) return { ok: false, reason: 'partial' };
  if (touches.some((t) => t.status === 'mismatch')) return { ok: false, reason: 'mismatch' };
  if (touches.length === 0) return { ok: false, reason: 'no-surface' };
  return { ok: true, covers: touches.map((t) => t.ref) };
}

/** A place a card could try to go: the outer vertex of an open surface. */
export interface PlacementOption {
  at: Vec;
  check: PlacementCheck;
  touches: SurfaceTouch[];
}

/** Every spot that would fully cover some open surface, legal or not, with why. */
export function placementOptions(placements: readonly Placement[], cardId: number, radius: number): PlacementOption[] {
  const seen = new Set<string>();
  const options: PlacementOption[] = [];
  const vis = visibility(placements);
  const counts = visibleCounts(vis);
  for (const ref of openSurfaces(placements)) {
    // A surface can only be fully covered by a card centered on its outer vertex.
    const at = add(placements[ref.placement]!.at, COVER_OFFSET[ref.surface]);
    if (seen.has(vkey(at))) continue;
    seen.add(vkey(at));
    const touches = surfaceTouches(placements, cardId, at, vis, counts);
    options.push({ at, check: judge(placements, at, radius, touches), touches });
  }
  return options;
}

/** Every center where `cardId` could legally be placed. */
export function legalPlacements(placements: readonly Placement[], cardId: number, radius: number): Vec[] {
  return placementOptions(placements, cardId, radius)
    .filter((o) => o.check.ok)
    .map((o) => o.at);
}
