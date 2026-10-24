import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { card, cardName, legalPlacements, type Move, type PlayerView } from '@triface/engine';
import { Board } from './Board.tsx';
import { CardIcon } from './CardView.tsx';

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

/** The game table as one player sees it. */
export function Table({ view, onMove, error, setError, offline, gate, sidebar, onQuit }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const { phase } = view;
  const turnPlayer = view.players[view.current]!;
  const myTurn = turnPlayer.id === view.me;
  const hand = view.players.find((p) => p.id === view.me)?.hand ?? [];
  const radius = view.config.radius;

  // Drop a stale selection whenever the turn or phase moves on.
  useEffect(() => setSelected(null), [view.current, phase.kind, view.board.length]);

  const spots = useMemo(
    () => (selected === null ? [] : legalPlacements(view.board, selected, radius)),
    [view.board, selected, radius],
  );
  const playable = useMemo(
    () => new Set(hand.filter((id) => legalPlacements(view.board, id, radius).length > 0)),
    [view.board, hand, radius],
  );

  function send(move: Move) {
    setSelected(null);
    onMove(move);
  }

  function clickCard(cardId: number) {
    if (!myTurn) return;
    if (phase.kind === 'comboDiscard') return send({ type: 'discard', cardId });
    if (phase.kind === 'drawn' && cardId !== phase.cardId) return setError('You may only place the card you drew.');
    setError(null);
    setSelected(selected === cardId ? null : cardId);
  }

  const cannotDraw = view.deckCount + view.discard.length === 0;
  let prompt = 'Pick a card, then click a highlighted spot.';
  if (phase.kind === 'drawn') prompt = 'You drew a playable card. Place it or keep it.';
  if (phase.kind === 'comboDiscard') prompt = 'Combo! Click a card to discard it, or skip.';
  if (phase.kind === 'play' && playable.size === 0) {
    prompt = cannotDraw ? 'No moves and nothing to draw. Pass.' : 'No card fits. Draw one.';
  }
  const over = phase.kind === 'roundOver' || phase.kind === 'gameOver';

  return (
    <main className="game">
      <aside className="side">
        <h2>Players</h2>
        <ul className="players">
          {view.players.map((p, i) => (
            <li key={p.id} className={i === view.current ? 'current' : ''}>
              <span>
                {offline?.has(p.id) && <span className="offline" title="Disconnected" />}
                {p.name}
                {p.id === view.me && offline && <span className="muted"> (you)</span>}
              </span>
              <span className="muted">
                {p.handCount} cards · {p.score} pts
              </span>
            </li>
          ))}
        </ul>
        <p className="muted">
          Round {view.round} · Draw pile {view.deckCount} · Discard {view.discard.length} · Play goes{' '}
          {view.direction === 1 ? 'forward' : 'backward'}
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
      </aside>

      <section className="table">
        <Board
          board={view.board}
          radius={radius}
          selected={gate ? null : selected}
          spots={spots}
          onPlace={(at) => selected !== null && send({ type: 'place', cardId: selected, at })}
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
                  {phase.kind === 'play' &&
                    (cannotDraw ? (
                      <button onClick={() => send({ type: 'pass' })}>Pass</button>
                    ) : (
                      <button onClick={() => send({ type: 'draw' })}>Draw</button>
                    ))}
                  {phase.kind === 'drawn' && <button onClick={() => send({ type: 'pass' })}>Keep it</button>}
                  {phase.kind === 'comboDiscard' && (
                    <button onClick={() => send({ type: 'skipDiscard' })}>Skip</button>
                  )}
                </>
              ) : (
                <span className="muted">Waiting for {turnPlayer.name}…</span>
              )}
            </div>
            {error && <p className="error">{error}</p>}
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
