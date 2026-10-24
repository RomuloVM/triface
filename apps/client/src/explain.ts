import {
  card,
  cardName,
  type Card,
  type Placement,
  type PlacementOption,
  type Shape,
  type Surface,
  type SurfaceRef,
} from '@triface/engine';

const NEEDS: Record<Surface, (covered: Card) => string> = {
  top: (c) => `a ${c.color} card`,
  side: (c) => `a ${c.num}`,
  face: (c) => `a ${c.shape}`,
};

const MATCH: Record<Surface, string> = { top: 'same color', side: 'same number', face: 'same shape' };

/** What a face match does, by the placed card's shape. */
function power(shape: Shape, players: number): string {
  switch (shape) {
    case 'ring':
      return players === 2 ? 'Ring: your opponent is skipped.' : 'Ring: play reverses.';
    case 'spike':
      return 'Spike: every opponent draws 1.';
    case 'block':
      return 'Block: the next player is skipped.';
    case 'star':
      return 'Star: you play again.';
  }
}

const surfaceOf = (board: readonly Placement[], ref: SurfaceRef) =>
  `the ${ref.surface} of ${cardName(card(board[ref.placement]!.cardId))}`;

/** One sentence on what placing a card at this spot would do, or why it can't go there. */
export function explain(
  board: readonly Placement[],
  cardId: number,
  option: PlacementOption,
  players: number,
): string {
  const { check, touches } = option;
  if (check.ok) {
    const parts = touches.map((t) => `${surfaceOf(board, t.ref)} (${MATCH[t.ref.surface]})`);
    const face = touches.some((t) => t.ref.surface === 'face') ? ` ${power(card(cardId).shape, players)}` : '';
    if (parts.length === 1) return `Covers ${parts[0]}.${face}`;
    return `Combo! Covers ${parts.join(' and ')}, so you may discard a card.${face}`;
  }
  switch (check.reason) {
    case 'partial': {
      const half = touches.find((t) => t.status === 'partial')!;
      return (
        `Can't go here: it would cover only half of ${surfaceOf(board, half.ref)}. ` +
        'A showing surface must be covered completely or not at all.'
      );
    }
    case 'mismatch': {
      const bad = touches.find((t) => t.status === 'mismatch')!;
      const covered = card(board[bad.ref.placement]!.cardId);
      return `Can't go here: ${surfaceOf(board, bad.ref)} needs ${NEEDS[bad.ref.surface](covered)}.`;
    }
    case 'off-board':
      return "Can't go here: it would hang off the edge of the board.";
    case 'occupied':
      return "Can't go here: another card is already centered on this spot.";
    case 'no-surface':
      return "Can't go here: it wouldn't cover a whole surface.";
  }
}
