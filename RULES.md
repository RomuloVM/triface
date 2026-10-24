# Triface — Rules (v0.1, draft)

*Working title. Inspired by [STACCS](https://sticcy.cc/) by Sticcy — buy the physical game from its creator.*

Triface is a hand-shedding game for **2–6 players**. Every card is a hexagon drawn as a cube with three
surfaces, and you play cards onto a shared board so that they look like cubes stacked in 3D.

## The deck — 64 cards

Every card has **three attributes**, one per surface:

| Surface | Shows | Values |
|---|---|---|
| **Top** | Color | Red, Blue, Green, Gold |
| **Side** (right) | Number | 1, 2, 3, 4 |
| **Face** (left) | Shape | Ring, Spike, Block, Star |

Each combination of color × number × shape appears exactly once (4 × 4 × 4 = 64).

## Setup

1. Shuffle. Deal **6 cards** each (5 cards with 5–6 players).
2. Flip the top card of the deck into the center of the board. The rest is the **draw pile**.
3. The player after the dealer goes first. Play passes to the left.

## Placing a card

A card is placed so that it **fully covers one or more open surfaces** already on the board:

- Covering a **Top** → your card must share its **color**.
- Covering a **Side** → your card must share its **number**.
- Covering a **Face** → your card must share its **shape**.

Rules of the board:

- A surface is **open** only while it is completely visible.
- If your card touches an open surface, it must cover all of it, and it must match. You may not half-cover an open surface.
- Surfaces that are already partly covered are **broken**. You can cover them freely, with no matching needed.
- Two cards can never sit in the exact same spot, and every card must stay inside the board's edge.

## Your turn

Do one of the following:

- **Place** a card from your hand, or
- **Draw** 1 card. If you can place that card, you may do so right away. Otherwise your turn ends.

If both the draw pile and the discard pile are empty and you can't place a card, you pass.

## Bonuses

**Shape powers.** These trigger when your card covers a **Face** and so matches the shape:

| Shape | Power |
|---|---|
| Ring | Reverse the direction of play (with 2 players, it skips the opponent instead) |
| Spike | Every opponent draws 1 card |
| Block | Skip the next player |
| Star | Take another turn |

**Combo.** If one card covers **two or more open surfaces at once**, you may also **discard one card**
from your hand onto the discard pile. When the draw pile runs out, the discard pile is shuffled to form a new one.

## Ending a round

- A round ends when a player empties their hand. A round also ends when every player passes in a row; in that case nobody has gone out.
- Each player scores **penalty points** equal to the sum of the numbers left in their hand.
- Play rounds until someone reaches **25 points**. The **lowest** total wins.
