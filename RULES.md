# Triface — Rules (v0.2, draft)

*Working title. Inspired by [STACCS](https://sticcy.cc/) by Sticcy — buy the physical game from its creator.*

Triface is a hand-shedding game for **2–10 players**. Every card is a hexagon drawn as a cube with three
surfaces, and you play cards onto a shared board so that they look like cubes stacked in 3D.

## The deck — 72 cards

Most cards have **three attributes**, one per surface:

| Surface | Shows | Values |
|---|---|---|
| **Top** | Color | Red, Blue, Green, Gold |
| **Side** (right) | Number | 1, 2, 3, 4 |
| **Face** (left) | Shape | Ring, Spike, Block, Star |

Each combination of color × number × shape appears exactly once (4 × 4 × 4 = 64). There are also
8 special cards:

| Card | Copies | What it is |
|---|---|---|
| **Mirror** | 1 per color (4) | A colored top with a blank, mirrored side and face. |
| **Bridge** | 4 | Blank on all three surfaces. |

**Blank surfaces match anything.** A Mirror can cover any side or face, but covers a top only of its own
color. A Bridge can cover any surface. Any card can cover a blank surface on the board.

With **7 or more players**, shuffle two decks together (144 cards) and play on a bigger board.

## Setup

1. Shuffle. Deal **6 cards** each (5 cards with 5 or more players).
2. Turn over cards from the deck until you reach a regular card, and put it in the center of the board.
   Shuffle any special cards you turned over back into the deck. The deck is the **draw pile**.
3. The player after the dealer goes first. Play passes down the player list.

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

1. **Place** a card from your hand, or **draw** 1 card. If you can place the card you drew, you may place it.
2. After placing a card, you may place **more cards with the same number** as your first card, one at a
   time. Each one must be placed legally, and each can trigger its own power. Special cards have no number,
   so a turn that starts with one has no extra cards.
3. Press **End turn**.

If both the draw pile and the discard pile are empty and you can't place a card, you pass by ending your turn.

## Powers

A card's shape power triggers when it covers a **Face** (and so matches the shape):

| Shape | Power |
|---|---|
| Ring | Reverse the direction of play (with 2 players, it skips the opponent instead) |
| Spike | The next player must answer or take **2 cards** (see below) |
| Block | Skip the next player |
| Star | Take another turn after this one |

A **Mirror** that covers a face copies that face's power. A **Bridge** never triggers a power.

**Spike penalties stack.** When a Spike targets you, you must start your turn by either:

- **answering** with a card that triggers Spike again (a Spike covering a Spike face, or a Mirror
  covering a Spike face). The penalty grows by 2 and passes to the next player; or
- **taking** the cards: draw the whole penalty, and your turn ends.

**Combo.** If one card covers **two or more open surfaces at once**, you may also **discard one card**
from your hand onto the discard pile during that turn. When the draw pile runs out, the discard pile is
shuffled to form a new one.

## Last card

Anyone can press **Last card** at any time.

- When you hold **exactly one card**, press it before you end your turn.
- If you end your turn holding one card without having pressed it, you draw a card and your turn does not
  end. This repeats every time you press **End turn** until you press **Last card**.
- Pressing it at any other time, when you hold more than one card, makes you draw a card.

## Ending a round

- A round ends when a player empties their hand. A round also ends when every player passes in a row; in that case nobody has gone out.
- Each player scores **penalty points** equal to the sum of the numbers left in their hand. Special cards count **5** each.
- Play rounds until someone reaches **25 points**. The **lowest** total wins.
