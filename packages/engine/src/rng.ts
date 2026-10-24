/** Mulberry32: a tiny seeded PRNG, so a game can be replayed from its seed. */
export function nextRandom(seed: number): { value: number; seed: number } {
  const next = (seed + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, seed: next };
}

/** Fisher–Yates shuffle in place; returns the advanced seed. */
export function shuffle<T>(items: T[], seed: number): number {
  for (let i = items.length - 1; i > 0; i--) {
    const r = nextRandom(seed);
    seed = r.seed;
    const j = Math.floor(r.value * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return seed;
}
