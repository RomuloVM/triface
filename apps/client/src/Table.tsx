import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  canPlaceCard,
  card,
  cardName,
  facingPenalty,
  placementOptions,
  turnRule,
  vkey,
  type Move,
  type PlayerView,
} from '@triface/engine';
import { Board } from './Board.tsx';
import { CardIcon } from './CardView.tsx';
import { explain, type Spot } from './explain.ts';

interface Props {
  view: PlayerView;
  onMove: (move: Move) => void;
  error: string | null;
  setError: (error: string | null) => void;
  /** Player ids that are currently disconnected (online play). */
  offline?: Set<string>;
  /** Shown in place of the hand, e.g. "pass the device" on a shared screen. */
  gate?: ReactNode;
  /** Extra controls for the side panel. */
  sidebar?: ReactNode;
  onQuit: () => void;
}

/** What the current player can do at this point of their turn. */
function turnPrompt(view: PlayerView, canPlay: boolean, cannotDraw: boolean): string {
  const { phase, penalty, turn } = view;
  const discard = turn.discards > 0 ? ' Combo: you may also select a card and discard it.' : '';
  if (view.owesCall) return 'You forgot to call it: press Last card before ending your turn.';
  switch (phase.kind) {
    case 'play':
      if (facingPenalty(view, view.me)) {
        return canPlay
          ? `Spike! Answer by matching a Spike face, or take ${penalty!.count} cards.`
          : `Spike! No answer in your hand: take ${penalty!.count} cards.`;
      }
      if (canPlay) return 'Pick a card, then click a highlighted spot, or draw.';
      return cannotDraw ? 'No moves and nothing to draw. End your turn to pass.' : 'No card fits. Draw one.';
    case 'drawn':
      return 'You drew a card that fits. Place it, or end your turn.';
    case 'placed':
      return phase.chain !== null && canPlay
        ? `Place another ${phase.chain}, or end your turn.${discard}`
        : `End your turn when ready.${discard}`;
    default:
      return 'End your turn.';
  }
}

/** The game table as one player sees it. */
export function Table({ view, onMove, error, setError, offline, gate, sidebar, onQuit }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  // The spot under the pointer, and a blocked spot that was tapped to see why.
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const { phase } = view;
  const turnPlayer = view.players[view.current]!;
  const myTurn = turnPlayer.id === view.me;
  const me = view.players.find((p) => p.id === view.me);
  const hand = me?.hand ?? [];
  const radius = view.config.radius;

  // Drop a stale selection whenever the turn or phase moves on.
  useEffect(() => setSelected(null), [view.current, phase.kind, view.board.length]);
  useEffect(() => {
    setHovered(null);
    setPinned(null);
  }, [selected, view.board.length]);

  const spots: Spot[] = useMemo(() => {
    if (selected === null) return [];
    return placementOptions(view.board, selected, radius).map((o) => {
      const rule = o.check.ok ? turnRule(view, view.me, selected, o.check.covers) : null;
      return { ...o, rule, allowed: o.check.ok && rule === null };
    });
  }, [view, selected, radius]);
  const focus = hovered ?? pinned;
  const focused = spots.find((o) => vkey(o.at) === focus);
  const hint = focused && selected !== null ? explain(view.board, selected, focused, view.players.length) : null;
  const playable = useMemo(
    () => new Set(myTurn ? hand.filter((id) => canPlaceCard(view, view.me, id, radius)) : []),
    [view, hand, radius, myTurn],
  );

  function send(move: Move) {
    setSelected(null);
    onMove(move);
  }

  function clickCard(cardId: number) {
    if (!myTurn) return;
    if (phase.kind === 'drawn' && cardId !== phase.cardId) return setError('You may only place the card you drew.');
    setError(null);
    setSelected(selected === cardId ? null : cardId);
  }

  const cannotDraw = view.deckCount + view.discard.length === 0;
  const facing = facingPenalty(view, view.me);
  let prompt = turnPrompt(view, playable.size > 0, cannotDraw);
  if (selected !== null && spots.some((o) => o.allowed) && !view.owesCall) {
    prompt = spots.some((o) => !o.allowed)
      ? "Click a highlighted spot. Gray spots don't fit: point at one to see why."
      : 'Click a highlighted spot.';
  }
  const over = phase.kind === 'roundOver' || phase.kind === 'gameOver';
  const passing = phase.kind === 'play' && !facing && cannotDraw && playable.size === 0;
  const canEnd = phase.kind !== 'play' || passing;
  const canDiscard = phase.kind === 'placed' && view.turn.discards > 0 && selected !== null;
  const calledLast = view.called.includes(view.me);

  return (
    <main className="game">
      <aside className="side">
        <h2>
          Players{' '}
          <span
            className={`direction ${view.direction === 1 ? '' : 'reversed'}`}
            title={view.direction === 1 ? 'Play goes down the list' : 'Play goes up the list'}
          >
            ↓
          </span>
        </h2>
        <ul className="players">
          {view.players.map((p, i) => (
            <li key={p.id} className={i === view.current ? 'current' : ''}>
              <span>
                {offline?.has(p.id) && <span className="offline" title="Disconnected" />}
                {p.name}
                {p.id === view.me && offline && <span className="muted"> (you)</span>}
                {view.called.includes(p.id) && <span className="badge">Last</span>}
              </span>
              <span className="muted">
                {p.handCount} {p.handCount === 1 ? 'card' : 'cards'} · {p.score} pts
              </span>
            </li>
          ))}
        </ul>
        <p className="muted">
          Round {view.round} · Draw pile {view.deckCount} · Discard {view.discard.length} · Play goes{' '}
          {view.direction === 1 ? 'down' : 'up'} the list
          {view.penalty && ` · Spike penalty: ${view.penalty.count} cards`}
        </p>
        {sidebar}
        <h2>Log</h2>
        <ol className="log">
          {view.log.slice(-12).map((line, i) => (
            <li key={view.log.length - 12 + i}>{line}</li>
          ))}
        </ol>
        <button className="ghost" onClick={onQuit}>
          Quit to menu
        </button>
        <p className="side-credit">
          Inspired by STACCS by Sticcy.{' '}
          <a href="https://sticcy.cc/" target="_blank" rel="noopener noreferrer">
            Get the original game
          </a>
        </p>
      </aside>

      <section className="table">
        <Board
          board={view.board}
          radius={radius}
          selected={gate ? null : selected}
          options={spots}
          focus={focus}
          onFocus={setHovered}
          onPick={(option) => {
            if (selected === null) return;
            if (option.allowed) return send({ type: 'place', cardId: selected, at: option.at });
            setPinned(vkey(option.at));
          }}
        />
      </section>

      <footer className="hand-area">
        {over ? (
          <div className="banner">
            <strong>{view.log[view.log.length - 1]}</strong>
            {phase.kind === 'roundOver' ? (
              <button onClick={() => send({ type: 'nextRound' })}>Next round</button>
            ) : (
              <button onClick={onQuit}>Back to menu</button>
            )}
          </div>
        ) : gate ? (
          gate
        ) : (
          <>
            <div className="banner">
              {myTurn ? (
                <>
                  <strong>Your turn.</strong> <span>{prompt}</span>
                  {phase.kind === 'play' && !cannotDraw && (
                    <button onClick={() => send({ type: 'draw' })}>
                      {facing ? `Take ${view.penalty!.count} cards` : 'Draw'}
                    </button>
                  )}
                  {canDiscard && (
                    <button className="ghost" onClick={() => send({ type: 'discard', cardId: selected })}>
                      Discard {cardName(card(selected))}
                    </button>
                  )}
                  {canEnd && <button onClick={() => send({ type: 'endTurn' })}>{passing ? 'Pass' : 'End turn'}</button>}
                </>
              ) : (
                <span className="muted">Waiting for {turnPlayer.name}…</span>
              )}
              <button
                className={`last-card ${calledLast ? 'called' : ''}`}
                onClick={() => send({ type: 'lastCard' })}
                title="Press when you hold exactly one card. Pressing it at the wrong time costs a card."
              >
                {calledLast ? 'Last card called' : 'Last card!'}
              </button>
            </div>
            {/* Always rendered, so the board doesn't jump when a hint appears. */}
            <p className={hint && focused?.allowed ? 'hint' : 'hint error'} aria-live="polite">
              {hint ?? error}
            </p>
            <div className="hand">
              {hand.map((id) => (
                <button
                  key={id}
                  className={`card ${selected === id ? 'selected' : ''} ${myTurn && playable.has(id) ? '' : 'dim'}`}
                  onClick={() => clickCard(id)}
                  aria-pressed={selected === id}
                  aria-label={cardName(card(id))}
                  disabled={!myTurn}
                >
                  <CardIcon cardId={id} />
                </button>
              ))}
            </div>
          </>
        )}
      </footer>
    </main>
  );
}
