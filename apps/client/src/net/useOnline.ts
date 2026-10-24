import { useEffect, useRef, useState } from 'react';
import { joinRoom, selfId } from 'trystero';
import type { Move, PlayerView } from '@triface/engine';
import { load, save } from '../storage.ts';
import { importSigningKey, importVerifyKey, open, seal, type Invite } from './crypto.ts';
import { HostSession, type HostSnapshot } from './host.ts';
import type { Outgoing, Seat, ToHost } from './protocol.ts';
import { parseToGuest, parseToHost } from './validate.ts';

/** Shared by everyone running Triface; rooms are separated by their secret. */
const APP_ID = 'triface-game-romulovm-v1';

/** The host's game, saved in its own browser so a reload resumes it. */
export const hostKey = (secret: string) => `triface:host:${secret}`;
/** The host's private signing key, saved alongside. */
export const signingKey = (secret: string) => `triface:hostkey:${secret}`;

export interface Identity {
  token: string;
  name: string;
}

export type OnlineStatus = 'connecting' | 'lobby' | 'game' | 'rejected';

export interface Online {
  status: OnlineStatus;
  seats: Seat[];
  /** This player's public id. */
  you: string | null;
  view: PlayerView | null;
  error: string | null;
  setError: (error: string | null) => void;
  /** Guests: whether the host is reachable right now. Always true for the host. */
  hostOnline: boolean;
  rejected: string | null;
  start: () => void;
  kick: (playerId: string) => void;
  move: (move: Move) => void;
}

/**
 * Join the room behind `invite` as its host or as a guest.
 *
 * Only people with the invite link know the room secret, which is both the
 * room id and the password for Trystero's signaling. The host signs everything
 * it sends with its private key; guests check each message against the public
 * key in the link, so another player can't pretend to be the host.
 */
export function useOnline(invite: Invite, me: Identity, asHost: boolean): Online {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [you, setYou] = useState<string | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [hostOnline, setHostOnline] = useState(asHost);
  const [heardFromHost, setHeardFromHost] = useState(asHost);

  const session = useRef<HostSession | null>(null);
  /** Host only: send messages, save the game and refresh the host's own screen. */
  const publish = useRef<(out: Outgoing[]) => void>(() => {});
  /** Guest only: send a message to the host. */
  const toHost = useRef<((msg: ToHost) => void) | null>(null);

  useEffect(() => {
    let live = true;
    const r = joinRoom({ appId: APP_ID, password: invite.secret }, invite.secret);
    const action = r.makeAction('msg');
    type Payload = Parameters<typeof action.send>[0];
    const send = (data: unknown, peer: string) => void action.send(data as Payload, { target: peer });
    // Handle messages strictly in arrival order, even though signing and checking are async.
    let queue = Promise.resolve();
    const inOrder = (task: () => Promise<void>) => {
      queue = queue.then(task).catch((e: unknown) => console.error('Triface network error', e));
    };

    if (asHost) {
      const host = new HostSession(me.token, me.name, load<HostSnapshot>(hostKey(invite.secret)));
      session.current = host;
      const jwk = load<JsonWebKey>(signingKey(invite.secret));
      const key = jwk ? importSigningKey(jwk) : Promise.reject(new Error('Missing host key'));
      publish.current = (out) => {
        save(hostKey(invite.secret), host.snapshot());
        setSeats([...host.seats]);
        setYou(host.hostId);
        setView(host.viewFor(me.token));
        inOrder(async () => {
          const k = await key;
          for (const o of out) send(await seal(k, o.peer, o.msg), o.peer);
        });
      };
      publish.current([]);
      action.onMessage = (data, { peerId }) => {
        const msg = parseToHost(data);
        if (!msg) return; // malformed or hostile: ignore
        if (msg.t === 'hello') publish.current(host.hello(peerId, msg));
        else publish.current(host.move(peerId, msg.move).out);
      };
      // Prove to each newcomer that we're the host, so it knows where to send its token.
      r.onPeerJoin = (peerId) => publish.current([{ peer: peerId, msg: { t: 'welcome' } }]);
      r.onPeerLeave = (peerId) => publish.current(host.leave(peerId));
    } else {
      const verifyKey = importVerifyKey(invite.hostKey);
      let hostPeer: string | null = null;
      const hello: ToHost = { t: 'hello', token: me.token, name: me.name };
      toHost.current = (msg) => hostPeer && send(msg, hostPeer);
      // Our token goes only to the peer that proves it's the host (see `welcome`).
      r.onPeerLeave = (peerId) => {
        if (peerId === hostPeer) setHostOnline(false);
      };
      action.onMessage = (data, { peerId }) =>
        inOrder(async () => {
          const msg = parseToGuest(await open(await verifyKey, selfId, data));
          if (!msg || !live) return; // not from the host, not for us, or malformed
          hostPeer = peerId;
          setHostOnline(true);
          if (msg.t === 'welcome') {
            send(hello, peerId);
            return;
          }
          setHeardFromHost(true);
          if (msg.t === 'lobby') {
            setSeats(msg.seats);
            setYou(msg.you);
            setView(null);
          } else if (msg.t === 'game') {
            setSeats(msg.seats);
            setYou(msg.view.me);
            setView(msg.view);
          } else if (msg.t === 'error') {
            setError(msg.message);
          } else {
            setRejected(msg.reason);
          }
        });
    }

    return () => {
      live = false;
      void r.leave();
      session.current = null;
      toHost.current = null;
    };
  }, [invite.secret, invite.hostKey, me.token, me.name, asHost]);

  return {
    status: rejected ? 'rejected' : !heardFromHost ? 'connecting' : view ? 'game' : 'lobby',
    seats,
    you,
    view,
    error,
    setError,
    hostOnline,
    rejected,
    start: () => {
      const host = session.current;
      if (!host) return;
      try {
        publish.current(host.start(crypto.getRandomValues(new Uint32Array(1))[0]! | 0));
      } catch (e) {
        setError((e as Error).message);
      }
    },
    kick: (playerId) => {
      const host = session.current;
      if (!host) return;
      try {
        publish.current(host.kick(playerId));
      } catch (e) {
        setError((e as Error).message);
      }
    },
    move: (move) => {
      setError(null);
      const host = session.current;
      if (host) {
        const { error: err, out } = host.move(null, move);
        if (err) setError(err);
        else publish.current(out);
      } else if (toHost.current) {
        toHost.current({ t: 'move', move });
      } else {
        setError('Not connected to the host.');
      }
    },
  };
}
