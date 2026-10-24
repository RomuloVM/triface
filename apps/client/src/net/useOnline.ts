import { useEffect, useRef, useState } from 'react';
import { joinRoom, type Room } from 'trystero';
import type { Move, PlayerView } from '@triface/engine';
import { load, save } from '../storage.ts';
import { HostSession, type HostSnapshot } from './host.ts';
import type { Outgoing, Seat, ToGuest, ToHost } from './protocol.ts';

/** Shared by everyone running Triface; rooms are separated by their code. */
const APP_ID = 'triface-game-romulovm-v1';

export const hostKey = (code: string) => `triface:host:${code}`;

export interface Identity {
  token: string;
  name: string;
}

export type OnlineStatus = 'connecting' | 'lobby' | 'game' | 'rejected';

export interface Online {
  status: OnlineStatus;
  seats: Seat[];
  view: PlayerView | null;
  error: string | null;
  setError: (error: string | null) => void;
  /** Guests: whether the host is reachable right now. Always true for the host. */
  hostOnline: boolean;
  rejected: string | null;
  start: () => void;
  move: (move: Move) => void;
}

type Message = ToHost | ToGuest;

/**
 * Join room `code` as its host or as a guest. The host keeps the real game in a
 * HostSession and saves it locally, so a reload resumes the game.
 */
export function useOnline(code: string, me: Identity, asHost: boolean): Online {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [hostOnline, setHostOnline] = useState(asHost);
  const [heardFromHost, setHeardFromHost] = useState(asHost);

  const room = useRef<Room | null>(null);
  const send = useRef<(msg: Message, peer: string) => void>(() => {});
  const session = useRef<HostSession | null>(null);
  /** Host only: send messages, save the game and refresh the host's own screen. */
  const publish = useRef<(out: Outgoing[]) => void>(() => {});
  const hostPeer = useRef<string | null>(null);

  useEffect(() => {
    const r = joinRoom({ appId: APP_ID }, code);
    room.current = r;
    const action = r.makeAction('msg');
    type Payload = Parameters<typeof action.send>[0];
    // Messages are plain JSON; Trystero's payload type just can't see that through our interfaces.
    send.current = (msg, peer) => void action.send(msg as unknown as Payload, { target: peer });
    let onMsg: (msg: Message, peerId: string) => void = () => {};
    action.onMessage = (data, { peerId }) => onMsg(data as unknown as Message, peerId);

    if (asHost) {
      const host = new HostSession(me.token, me.name, load<HostSnapshot>(hostKey(code)) ?? undefined);
      session.current = host;
      publish.current = (out) => {
        for (const o of out) send.current(o.msg, o.peer);
        save(hostKey(code), host.snapshot());
        setSeats([...host.seats]);
        setView(host.viewFor(me.token));
      };
      publish.current([]);
      onMsg = (msg, peerId) => {
        if (msg.t === 'hello') publish.current(host.hello(peerId, msg));
        else if (msg.t === 'move') publish.current(host.move(peerId, msg.move).out);
      };
      r.onPeerLeave = (peerId) => publish.current(host.leave(peerId));
    } else {
      const hello: ToHost = { t: 'hello', token: me.token, name: me.name };
      // Every peer gets a hello; only the host answers.
      r.onPeerJoin = (peerId) => send.current(hello, peerId);
      r.onPeerLeave = (peerId) => {
        if (peerId === hostPeer.current) setHostOnline(false);
      };
      onMsg = (msg, peerId) => {
        if (msg.t === 'hello' || msg.t === 'move') return; // other guests talking to the host
        hostPeer.current = peerId;
        setHostOnline(true);
        setHeardFromHost(true);
        if (msg.t === 'lobby') {
          setSeats(msg.seats);
          setView(null);
        } else if (msg.t === 'game') {
          setSeats(msg.seats);
          setView(msg.view);
        } else if (msg.t === 'error') {
          setError(msg.message);
        } else {
          setRejected(msg.reason);
        }
      };
    }

    return () => {
      void r.leave();
      room.current = null;
      session.current = null;
      hostPeer.current = null;
    };
  }, [code, me.token, me.name, asHost]);

  return {
    status: rejected ? 'rejected' : !heardFromHost ? 'connecting' : view ? 'game' : 'lobby',
    seats,
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
    move: (move) => {
      setError(null);
      const host = session.current;
      if (host) {
        const { error: err, out } = host.move(null, move);
        if (err) setError(err);
        else publish.current(out);
      } else if (hostPeer.current) {
        send.current({ t: 'move', move }, hostPeer.current);
      } else {
        setError('Not connected to the host.');
      }
    },
  };
}
