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
import { generateHostKeys, inviteFragment, parseInvite, randomSecret, type Invite } from './net/crypto.ts';
import type { HostSnapshot } from './net/host.ts';
import { randomToken } from './net/protocol.ts';
import { hostKey, signingKey, useOnline, type Identity } from './net/useOnline.ts';
import { cleanName } from './net/validate.ts';
import { load, remove, save } from './storage.ts';

type Screen = { kind: 'home' } | { kind: 'hotseat' } | { kind: 'online'; invite: Invite; host: boolean };

/** The invite lives after `#`, so browsers never send it to the web server. */
const inviteFromUrl = (): Invite | null => parseInvite(location.hash);

function setUrlInvite(invite: Invite | null) {
  const url = new URL(location.href);
  url.hash = invite ? inviteFragment(invite) : '';
  url.search = ''; // drop links from older versions
  history.replaceState(null, '', url);
}

const inviteLink = (invite: Invite) => `${location.origin}${location.pathname}${inviteFragment(invite)}`;

/**
 * This tab's player token. It survives reloads, so a player keeps their seat,
 * but every tab gets its own, so two tabs are two players.
 */
function myToken(): string {
  const saved = load<string>('triface:token', 'session');
  if (saved && /^[0-9a-f]{32}$/.test(saved)) return saved;
  const token = randomToken();
  save('triface:token', token, 'session');
  return token;
}

/** Did this tab host the room? Then reopening it resumes the game. */
function hosting(invite: Invite, token: string): boolean {
  return load<HostSnapshot>(hostKey(invite.secret))?.hostToken === token && load(signingKey(invite.secret)) !== null;
}

export function App() {
  const token = useMemo(myToken, []);
  const [name, setName] = useState(() => load<string>('triface:name') ?? '');
  const [screen, setScreen] = useState<Screen>(() => {
    // An invite link, or a reload mid-game, goes straight to the room once we know your name.
    const invite = inviteFromUrl();
    const named = (load<string>('triface:name') ?? '').trim().length > 0;
    return invite && named ? { kind: 'online', invite, host: hosting(invite, token) } : { kind: 'home' };
  });

  const home = () => {
    setUrlInvite(null);
    setScreen({ kind: 'home' });
  };

  if (screen.kind === 'hotseat') return <Hotseat onQuit={home} />;
  if (screen.kind === 'online') {
    return (
      <OnlineGame
        key={screen.invite.secret}
        invite={screen.invite}
        host={screen.host}
        me={{ token, name: cleanName(name) }}
        onQuit={home}
      />
    );
  }
  return (
    <Home
      name={name}
      setName={(n) => {
        setName(n);
        save('triface:name', n);
      }}
      onHost={async () => {
        const keys = await generateHostKeys();
        const invite = { secret: randomSecret(), hostKey: keys.publicKey };
        save(signingKey(invite.secret), keys.privateJwk);
        setUrlInvite(invite);
        setScreen({ kind: 'online', invite, host: true });
      }}
      onJoin={(invite) => {
        setUrlInvite(invite);
        setScreen({ kind: 'online', invite, host: hosting(invite, token) });
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
  onJoin: (invite: Invite) => void;
  onHotseat: () => void;
}

function Home({ name, setName, onHost, onJoin, onHotseat }: HomeProps) {
  const [link, setLink] = useState(() => {
    const invite = inviteFromUrl();
    return invite ? inviteLink(invite) : '';
  });
  const named = name.trim().length > 0;
  const invite = parseInvite(link);

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
        <button disabled={!named} onClick={onHost}>
          Host a game
        </button>
      </div>
      <div className="row">
        <input
          value={link}
          placeholder="…or paste an invite link"
          aria-label="Invite link"
          className="link-input"
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && named && invite && onJoin(invite)}
        />
        <button disabled={!named || !invite} onClick={() => invite && onJoin(invite)}>
          Join
        </button>
      </div>
      {!named && <p className="muted">Enter your name to play online.</p>}
      {named && link.trim() !== '' && !invite && <p className="error">That doesn't look like a Triface invite link.</p>}

      <h2>Play on this device</h2>
      <button className="ghost" onClick={onHotseat}>
        Pass-the-device game
      </button>
      <Credit />
    </main>
  );
}

function OnlineGame({ invite, host, me, onQuit }: { invite: Invite; host: boolean; me: Identity; onQuit: () => void }) {
  const online = useOnline(invite, me, host);
  const [copied, setCopied] = useState(false);
  const link = inviteLink(invite);
  const offline = useMemo(() => new Set(online.seats.filter((s) => !s.online).map((s) => s.id)), [online.seats]);
  const myTurn = online.view ? online.view.players[online.view.current]?.id === online.view.me : false;

  useEffect(() => {
    document.title = myTurn ? '● Your turn · Triface' : 'Triface';
    return () => void (document.title = 'Triface');
  }, [myTurn]);

  function quit() {
    if (host && !confirm('Leave this game? You are the host, so the game ends for everyone.')) return;
    if (host) {
      remove(hostKey(invite.secret));
      remove(signingKey(invite.secret));
    }
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
      <div className="muted">Invite link. Only people with it can join.</div>
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
        <h1>Joining…</h1>
        <p className="muted">
          Looking for the host. This usually takes a few seconds. If it doesn't connect, check that you have the whole
          link and that the host has the game open.
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
                {s.id === online.you && <span className="muted"> (you)</span>}
              </span>
              <span className="muted">
                {s.host ? (
                  'host'
                ) : host ? (
                  <button className="ghost small" onClick={() => online.kick(s.id)} aria-label={`Remove ${s.name}`}>
                    Remove
                  </button>
                ) : null}
              </span>
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
