import {
  card,
  cardName,
  placementPower,
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
      return 'Spike: the next player must answer with a Spike or take the cards.';
    case 'block':
      return 'Block: the next player is skipped.';
    case 'star':
      return 'Star: you play again.';
  }
}

/** Why a covered surface matched: its attribute, or a blank surface on either card. */
function matchedBy(board: readonly Placement[], cardId: number, ref: SurfaceRef): string {
  const placed = card(cardId);
  const covered = card(board[ref.placement]!.cardId);
  const blank = (c: Card) => c.special === 'bridge' || (c.special === 'mirror' && ref.surface !== 'top');
  return blank(placed) || blank(covered) ? 'blank matches anything' : MATCH[ref.surface];
}

const surfaceOf = (board: readonly Placement[], ref: SurfaceRef) =>
  `the ${ref.surface} of ${cardName(card(board[ref.placement]!.cardId))}`;

/** A board spot for the selected card, with any rule of the turn that rules it out. */
export interface Spot extends PlacementOption {
  /** Why the turn so far forbids this spot, even though the board allows it. */
  rule: string | null;
  allowed: boolean;
}

/** One sentence on what placing a card at this spot would do, or why it can't go there. */
export function explain(board: readonly Placement[], cardId: number, spot: Spot, players: number): string {
  const { check, touches } = spot;
  if (spot.rule) return `Can't go here: ${spot.rule}`;
  if (check.ok) {
    const parts = touches.map((t) => `${surfaceOf(board, t.ref)} (${matchedBy(board, cardId, t.ref)})`);
    const shape = placementPower(board, cardId, check.covers);
    const mirrored = card(cardId).special === 'mirror' ? 'Mirror copies ' : '';
    const face = shape ? ` ${mirrored}${power(shape, players)}` : '';
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
