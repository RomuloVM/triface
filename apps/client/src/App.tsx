import { useEffect, useMemo, useState } from 'react';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  applyMove,
  createGame,
  playerView,
  type GameState,
  type Move,
} from '@triface/engine';
import { Table } from './Table.tsx';
import { isRoomCode, randomCode, randomToken } from './net/protocol.ts';
import type { HostSnapshot } from './net/host.ts';
import { hostKey, useOnline, type Identity } from './net/useOnline.ts';
import { load, remove, save } from './storage.ts';

type Screen = { kind: 'home' } | { kind: 'hotseat' } | { kind: 'online'; code: string; host: boolean };

function roomFromUrl(): string | null {
  const code = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
  return isRoomCode(code) ? code : null;
}

function setUrlRoom(code: string | null) {
  const url = new URL(location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  history.replaceState(null, '', url);
}

/**
 * This tab's player token. It survives reloads, so a player keeps their seat,
 * but every tab gets its own, so two tabs are two players.
 */
function myToken(): string {
  const saved = load<string>('triface:token', 'session');
  if (saved) return saved;
  const token = randomToken();
  save('triface:token', token, 'session');
  return token;
}

/** Did this tab host room `code`? Then reopening it resumes the game. */
function hosting(code: string, token: string): boolean {
  return Boolean(load<HostSnapshot>(hostKey(code))?.seats.some((s) => s.host && s.id === token));
}

export function App() {
  const token = useMemo(myToken, []);
  const [name, setName] = useState(() => load<string>('triface:name') ?? '');
  const [screen, setScreen] = useState<Screen>(() => {
    // An invite link, or a reload mid-game, goes straight to the room once we know your name.
    const code = roomFromUrl();
    const named = (load<string>('triface:name') ?? '').trim().length > 0;
    return code && named ? { kind: 'online', code, host: hosting(code, token) } : { kind: 'home' };
  });

  const home = () => {
    setUrlRoom(null);
    setScreen({ kind: 'home' });
  };

  if (screen.kind === 'hotseat') return <Hotseat onQuit={home} />;
  if (screen.kind === 'online') {
    return <OnlineGame code={screen.code} host={screen.host} me={{ token, name: name.trim() }} onQuit={home} />;
  }
  return (
    <Home
      name={name}
      setName={(n) => {
        setName(n);
        save('triface:name', n);
      }}
      onHost={() => {
        const code = randomCode();
        setUrlRoom(code);
        setScreen({ kind: 'online', code, host: true });
      }}
      onJoin={(code) => {
        setUrlRoom(code);
        setScreen({ kind: 'online', code, host: hosting(code, token) });
      }}
      onHotseat={() => setScreen({ kind: 'hotseat' })}
    />
  );
}

function Credit() {
  return (
    <p className="credit">
      Inspired by STACCS by Sticcy. <a href="https://sticcy.cc/">Buy the physical game from its creator.</a>
    </p>
  );
}

interface HomeProps {
  name: string;
  setName: (name: string) => void;
  onHost: () => void;
  onJoin: (code: string) => void;
  onHotseat: () => void;
}

function Home({ name, setName, onHost, onJoin, onHotseat }: HomeProps) {
  const [code, setCode] = useState(roomFromUrl() ?? '');
  const named = name.trim().length > 0;
  const validCode = isRoomCode(code);

  return (
    <main className="setup">
      <h1>Triface</h1>
      <p className="muted">Stack cube cards by color, number and shape. 2–6 players.</p>

      <label className="field">
        <span>Your name</span>
        <input value={name} maxLength={20} placeholder="Name" onChange={(e) => setName(e.target.value)} />
      </label>

      <h2>Play online</h2>
      <div className="row">
        <input
          value={code}
          placeholder="Room code"
          aria-label="Room code"
          maxLength={5}
          className="code-input"
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && named && validCode && onJoin(code)}
        />
        <button disabled={!named || !validCode} onClick={() => onJoin(code)}>
          Join
        </button>
        <span className="muted">or</span>
        <button disabled={!named} onClick={onHost}>
          Host a game
        </button>
      </div>
      {!named && <p className="muted">Enter your name to play online.</p>}

      <h2>Play on this device</h2>
      <button className="ghost" onClick={onHotseat}>
        Pass-the-device game
      </button>
      <Credit />
    </main>
  );
}

function OnlineGame({ code, host, me, onQuit }: { code: string; host: boolean; me: Identity; onQuit: () => void }) {
  const online = useOnline(code, me, host);
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}${location.pathname}?room=${code}`;
  const offline = useMemo(() => new Set(online.seats.filter((s) => !s.online).map((s) => s.id)), [online.seats]);
  const myTurn = online.view ? online.view.players[online.view.current]?.id === me.token : false;

  useEffect(() => {
    document.title = myTurn ? '● Your turn · Triface' : 'Triface';
    return () => void (document.title = 'Triface');
  }, [myTurn]);

  function quit() {
    if (host && !confirm('Leave this game? You are the host, so the game ends for everyone.')) return;
    if (host) remove(hostKey(code));
    onQuit();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the link is still on screen to copy by hand.
    }
  }

  const share = (
    <div className="share">
      <div>
        Room <strong className="code">{code}</strong>
      </div>
      <div className="row">
        <input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.target.select()} />
        <button className="ghost" onClick={copy}>
          {copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    </div>
  );

  if (online.status === 'rejected') {
    return (
      <main className="setup">
        <h1>Can't join</h1>
        <p>{online.rejected}</p>
        <button onClick={onQuit}>Back to menu</button>
      </main>
    );
  }

  if (online.status === 'connecting') {
    return (
      <main className="setup">
        <h1>Joining {code}…</h1>
        <p className="muted">
          Looking for the host. This usually takes a few seconds. If it doesn't connect, check the code and that the
          host has the game open.
        </p>
        <button className="ghost" onClick={onQuit}>
          Cancel
        </button>
      </main>
    );
  }

  if (online.status === 'lobby') {
    const enough = online.seats.length >= MIN_PLAYERS;
    return (
      <main className="setup">
        <h1>Lobby</h1>
        {share}
        <h2>
          Players ({online.seats.length}/{MAX_PLAYERS})
        </h2>
        <ul className="players">
          {online.seats.map((s) => (
            <li key={s.id}>
              <span>
                {s.name}
                {s.id === me.token && <span className="muted"> (you)</span>}
              </span>
              <span className="muted">{s.host ? 'host' : ''}</span>
            </li>
          ))}
        </ul>
        {!online.hostOnline && <p className="error">The host disconnected. Waiting for them to come back…</p>}
        {host ? (
          <div className="row">
            <button disabled={!enough} onClick={online.start}>
              Start game
            </button>
            {!enough && <span className="muted">Share the link. You need at least {MIN_PLAYERS} players.</span>}
          </div>
        ) : (
          <p className="muted">Waiting for the host to start the game…</p>
        )}
        {online.error && <p className="error">{online.error}</p>}
        <button className="ghost" onClick={quit}>
          Leave
        </button>
        <Credit />
      </main>
    );
  }

  return (
    <Table
      view={online.view!}
      onMove={online.move}
      error={online.hostOnline ? online.error : 'The host disconnected. Waiting for them to come back…'}
      setError={online.setError}
      offline={offline}
      sidebar={share}
      onQuit={quit}
    />
  );
}

function Hotseat({ onQuit }: { onQuit: () => void }) {
  const [state, setState] = useState<GameState | null>(null);
  if (!state) {
    return (
      <HotseatSetup
        onStart={(names) =>
          setState(createGame(names.map((name, i) => ({ id: `p${i}`, name })), crypto.getRandomValues(new Uint32Array(1))[0]! | 0))
        }
        onQuit={onQuit}
      />
    );
  }
  return <HotseatGame initial={state} onQuit={onQuit} />;
}

function HotseatSetup({ onStart, onQuit }: { onStart: (names: string[]) => void; onQuit: () => void }) {
  const [names, setNames] = useState(['Player 1', 'Player 2']);
  return (
    <main className="setup">
      <h1>Pass the device</h1>
      <p className="muted">Everyone plays on this screen, taking turns.</p>
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
      <button className="ghost" onClick={onQuit}>
        Back
      </button>
    </main>
  );
}

function HotseatGame({ initial, onQuit }: { initial: GameState; onQuit: () => void }) {
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  // Hide the hand until the player whose turn it is says they're ready.
  const [revealedFor, setRevealedFor] = useState<string | null>(null);
  const me = state.players[state.current]!;
  const view = playerView(state, me.id);

  function move(m: Move) {
    const r = applyMove(state, me.id, m);
    if (!r.ok) return setError(r.error);
    setError(null);
    setState(r.state);
  }

  const gate =
    revealedFor === me.id ? undefined : (
      <div className="banner">
        <strong>Pass the device to {me.name}.</strong>
        <button onClick={() => setRevealedFor(me.id)}>I'm {me.name}, show my hand</button>
      </div>
    );

  return <Table view={view} onMove={move} error={error} setError={setError} gate={gate} onQuit={onQuit} />;
}
