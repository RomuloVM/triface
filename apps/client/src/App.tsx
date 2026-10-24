import { useMemo, useState } from 'react';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  applyMove,
  canPlace,
  createGame,
  legalPlacements,
  type GameState,
  type Move,
} from '@triface/engine';
import { Board } from './Board.tsx';
import { CardIcon } from './CardView.tsx';

export function App() {
  const [game, setGame] = useState<GameState | null>(null);
  return game ? (
    <Game initial={game} onQuit={() => setGame(null)} />
  ) : (
    <Setup onStart={(names) => setGame(createGame(names.map((name, i) => ({ id: `p${i}`, name })), Date.now() | 0))} />
  );
}

function Setup({ onStart }: { onStart: (names: string[]) => void }) {
  const [names, setNames] = useState(['Player 1', 'Player 2']);
  return (
    <main className="setup">
      <h1>Triface</h1>
      <p className="muted">Pass-the-device prototype. Online play comes next.</p>
      {names.map((n, i) => (
        <div className="row" key={i}>
          <input
            value={n}
            aria-label={`Player ${i + 1} name`}
            onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))}
          />
          {names.length > MIN_PLAYERS && (
            <button className="ghost" onClick={() => setNames(names.filter((_, j) => j !== i))}>
              Remove
            </button>
          )}
        </div>
      ))}
      <div className="row">
        {names.length < MAX_PLAYERS && (
          <button className="ghost" onClick={() => setNames([...names, `Player ${names.length + 1}`])}>
            Add player
          </button>
        )}
        <button onClick={() => onStart(names.map((n, i) => n.trim() || `Player ${i + 1}`))}>Start game</button>
      </div>
      <p className="credit">
        Inspired by STACCS by Sticcy. <a href="https://sticcy.cc/">Buy the physical game from its creator.</a>
      </p>
    </main>
  );
}

function Game({ initial, onQuit }: { initial: GameState; onQuit: () => void }) {
  const [state, setState] = useState(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Hot-seat: hide the hand until the player whose turn it is says they're ready.
  const [revealedFor, setRevealedFor] = useState<string | null>(null);

  const me = state.players[state.current]!;
  const { phase } = state;
  const revealed = revealedFor === me.id;

  const spots = useMemo(
    () => (selected === null ? [] : legalPlacements(state.board, selected, state.config.radius)),
    [state.board, selected, state.config.radius],
  );

  function send(move: Move) {
    const r = applyMove(state, me.id, move);
    if (!r.ok) return setError(r.error);
    setError(null);
    setSelected(null);
    setState(r.state);
  }

  function clickCard(cardId: number) {
    if (phase.kind === 'comboDiscard') return send({ type: 'discard', cardId });
    if (phase.kind === 'drawn' && cardId !== phase.cardId) return setError('You may only place the card you drew.');
    setError(null);
    setSelected(selected === cardId ? null : cardId);
  }

  const cannotDraw = state.deck.length + state.discard.length === 0;
  let prompt = 'Pick a card, then click a highlighted spot.';
  if (phase.kind === 'drawn') prompt = 'You drew a playable card. Place it or keep it.';
  if (phase.kind === 'comboDiscard') prompt = 'Combo! Click a card to discard it, or skip.';
  if (phase.kind === 'play' && !canPlace(state, state.current)) {
    prompt = cannotDraw ? 'No moves and nothing to draw. Pass.' : 'No card fits. Draw one.';
  }

  return (
    <main className="game">
      <aside className="side">
        <h2>Players</h2>
        <ul className="players">
          {state.players.map((p, i) => (
            <li key={p.id} className={i === state.current ? 'current' : ''}>
              <span>{p.name}</span>
              <span className="muted">
                {p.hand.length} cards · {p.score} pts
              </span>
            </li>
          ))}
        </ul>
        <p className="muted">
          Round {state.round} · Draw pile {state.deck.length} · Discard {state.discard.length} · Play goes{' '}
          {state.direction === 1 ? 'forward' : 'backward'}
        </p>
        <h2>Log</h2>
        <ol className="log">
          {state.log.slice(-12).map((line, i) => (
            <li key={state.log.length - 12 + i}>{line}</li>
          ))}
        </ol>
        <button className="ghost" onClick={onQuit}>
          Quit to menu
        </button>
      </aside>

      <section className="table">
        <Board
          board={state.board}
          radius={state.config.radius}
          selected={revealed ? selected : null}
          spots={spots}
          onPlace={(at) => selected !== null && send({ type: 'place', cardId: selected, at })}
        />
      </section>

      <footer className="hand-area">
        {phase.kind === 'roundOver' || phase.kind === 'gameOver' ? (
          <div className="banner">
            <strong>{state.log[state.log.length - 1]}</strong>
            {phase.kind === 'roundOver' ? (
              <button onClick={() => send({ type: 'nextRound' })}>Next round</button>
            ) : (
              <button onClick={onQuit}>New game</button>
            )}
          </div>
        ) : !revealed ? (
          <div className="banner">
            <strong>Pass the device to {me.name}.</strong>
            <button onClick={() => setRevealedFor(me.id)}>I'm {me.name}, show my hand</button>
          </div>
        ) : (
          <>
            <div className="banner">
              <strong>{me.name}'s turn.</strong> <span>{prompt}</span>
              {phase.kind === 'play' &&
                (cannotDraw ? (
                  <button onClick={() => send({ type: 'pass' })}>Pass</button>
                ) : (
                  <button onClick={() => send({ type: 'draw' })}>Draw</button>
                ))}
              {phase.kind === 'drawn' && <button onClick={() => send({ type: 'pass' })}>Keep it</button>}
              {phase.kind === 'comboDiscard' && <button onClick={() => send({ type: 'skipDiscard' })}>Skip</button>}
            </div>
            {error && <p className="error">{error}</p>}
            <div className="hand">
              {me.hand.map((id) => {
                const playable = legalPlacements(state.board, id, state.config.radius).length > 0;
                return (
                  <button
                    key={id}
                    className={`card ${selected === id ? 'selected' : ''} ${playable ? '' : 'dim'}`}
                    onClick={() => clickCard(id)}
                    aria-pressed={selected === id}
                  >
                    <CardIcon cardId={id} />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </footer>
    </main>
  );
}
