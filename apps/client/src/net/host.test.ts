import { describe, expect, it } from 'vitest';
import { legalPlacements } from '@triface/engine';
import { HostSession } from './host.ts';
import type { Outgoing, ToGuest } from './protocol.ts';

const hello = (token: string, name = token) => ({ t: 'hello' as const, token, name });
const to = (out: Outgoing[], peer: string): ToGuest | undefined => out.find((o) => o.peer === peer)?.msg;

function lobbyOf3() {
  const host = new HostSession('H', 'Host');
  host.hello('peer-a', hello('A', 'Ana'));
  host.hello('peer-b', hello('B', 'Bo'));
  return host;
}

describe('HostSession lobby', () => {
  it('seats new players and tells everyone', () => {
    const host = new HostSession('H', 'Host');
    host.hello('peer-a', hello('A', 'Ana'));
    const out = host.hello('peer-b', hello('B', 'Bo'));
    expect(out.map((o) => o.peer).sort()).toEqual(['peer-a', 'peer-b']);
    expect(to(out, 'peer-a')).toEqual({
      t: 'lobby',
      seats: [
        { id: 'H', name: 'Host', online: true, host: true },
        { id: 'A', name: 'Ana', online: true, host: false },
        { id: 'B', name: 'Bo', online: true, host: false },
      ],
    });
  });

  it('frees a lobby seat when a player leaves', () => {
    const host = lobbyOf3();
    const out = host.leave('peer-a');
    expect(host.seats.map((s) => s.id)).toEqual(['H', 'B']);
    expect(out.map((o) => o.peer)).toEqual(['peer-b']);
  });

  it('turns players away when the table is full, and stops impersonating the host', () => {
    const host = new HostSession('H', 'Host');
    for (const t of ['A', 'B', 'C', 'D', 'E']) host.hello(`peer-${t}`, hello(t));
    expect(to(host.hello('peer-F', hello('F')), 'peer-F')).toEqual({ t: 'rejected', reason: 'This table is full.' });
    expect(to(host.hello('peer-X', hello('H')), 'peer-X')?.t).toBe('rejected');
  });

  it('needs two players to start', () => {
    expect(() => new HostSession('H', 'Host').start(1)).toThrow();
  });
});

describe('HostSession game', () => {
  it('sends each guest only their own hand', () => {
    const host = lobbyOf3();
    const out = host.start(7);
    const a = to(out, 'peer-a');
    expect(a?.t).toBe('game');
    if (a?.t !== 'game') return;
    expect(a.view.me).toBe('A');
    expect(a.view.players.find((p) => p.id === 'A')?.hand).toHaveLength(6);
    expect(a.view.players.find((p) => p.id === 'B')?.hand).toBeUndefined();
    expect(a.view).not.toHaveProperty('deck');
  });

  it('applies moves only for the player who sent them', () => {
    const host = lobbyOf3();
    host.start(7);
    const current = host.state!.players[host.state!.current]!.id;
    const other = ['A', 'B'].find((t) => t !== current)!;

    const wrong = host.move(`peer-${other.toLowerCase()}`, { type: 'draw' });
    expect(wrong.error).toBe('It is not your turn.');
    expect(wrong.out).toEqual([{ peer: `peer-${other.toLowerCase()}`, msg: { t: 'error', message: 'It is not your turn.' } }]);

    const peer = current === 'H' ? null : `peer-${current.toLowerCase()}`;
    const ok = host.move(peer, { type: 'draw' });
    expect(ok.error).toBeUndefined();
    expect(ok.out).toHaveLength(2);
  });

  it('plays a whole placement from a guest', () => {
    const host = lobbyOf3();
    host.start(3);
    const s = host.state!;
    const me = s.players[s.current]!;
    const playable = me.hand.find((id) => legalPlacements(s.board, id, s.config.radius).length > 0);
    if (playable === undefined) return; // this deal has no opening placement; other tests cover drawing
    const at = legalPlacements(s.board, playable, s.config.radius)[0]!;
    const peer = me.id === 'H' ? null : `peer-${me.id.toLowerCase()}`;
    expect(host.move(peer, { type: 'place', cardId: playable, at }).error).toBeUndefined();
    expect(host.state!.board).toHaveLength(2);
  });

  it('keeps a seat for a player who drops, and lets them back in on a new connection', () => {
    const host = lobbyOf3();
    host.start(7);
    host.leave('peer-a');
    expect(host.seats.find((s) => s.id === 'A')?.online).toBe(false);
    expect(to(host.hello('peer-new', hello('Z')), 'peer-new')?.t).toBe('rejected');

    const back = host.hello('peer-a2', hello('A', 'Ana'));
    expect(host.seats.find((s) => s.id === 'A')?.online).toBe(true);
    expect(to(back, 'peer-a2')?.t).toBe('game');
  });

  it('ignores a stale disconnect after a reconnect', () => {
    const host = lobbyOf3();
    host.start(7);
    host.hello('peer-a2', hello('A', 'Ana'));
    host.leave('peer-a');
    expect(host.seats.find((s) => s.id === 'A')?.online).toBe(true);
  });

  it('resumes from a snapshot with guests marked offline', () => {
    const host = lobbyOf3();
    host.start(7);
    const resumed = new HostSession('H', 'Host', structuredClone(host.snapshot()));
    expect(resumed.state).toEqual(host.state);
    expect(resumed.seats.map((s) => s.online)).toEqual([true, false, false]);
  });
});
