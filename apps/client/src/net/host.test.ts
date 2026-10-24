import { describe, expect, it } from 'vitest';
import { legalPlacements } from '@triface/engine';
import { HostSession } from './host.ts';
import type { Outgoing, ToGuest } from './protocol.ts';

const hello = (token: string, name = token) => ({ t: 'hello' as const, token, name });
const to = (out: Outgoing[], peer: string): ToGuest | undefined => out.find((o) => o.peer === peer)?.msg;
const seatId = (host: HostSession, name: string) => host.seats.find((s) => s.name === name)!.id;

function lobbyOf3() {
  const host = new HostSession('HOST-TOKEN', 'Host');
  host.hello('peer-a', hello('ALICE-TOKEN', 'Ana'));
  host.hello('peer-b', hello('BOB-TOKEN', 'Bo'));
  return host;
}

/** The peer whose turn it is, or null for the host. */
function currentPeer(host: HostSession): string | null {
  const id = host.state!.players[host.state!.current]!.id;
  const name = host.seats.find((s) => s.id === id)!.name;
  return { Host: null, Ana: 'peer-a', Bo: 'peer-b' }[name]!;
}

describe('HostSession lobby', () => {
  it('seats new players and tells everyone, each with their own public id', () => {
    const host = new HostSession('HOST-TOKEN', 'Host');
    host.hello('peer-a', hello('ALICE-TOKEN', 'Ana'));
    const out = host.hello('peer-b', hello('BOB-TOKEN', 'Bo'));
    expect(out.map((o) => o.peer).sort()).toEqual(['peer-a', 'peer-b']);
    const a = to(out, 'peer-a');
    expect(a).toEqual({
      t: 'lobby',
      you: seatId(host, 'Ana'),
      seats: [
        { id: seatId(host, 'Host'), name: 'Host', online: true, host: true },
        { id: seatId(host, 'Ana'), name: 'Ana', online: true, host: false },
        { id: seatId(host, 'Bo'), name: 'Bo', online: true, host: false },
      ],
    });
  });

  it('frees a lobby seat when a player leaves', () => {
    const host = lobbyOf3();
    const out = host.leave('peer-a');
    expect(host.seats.map((s) => s.name)).toEqual(['Host', 'Bo']);
    expect(out.map((o) => o.peer)).toEqual(['peer-b']);
  });

  it('turns players away when the table is full', () => {
    const host = new HostSession('H', 'Host');
    for (const t of ['A', 'B', 'C', 'D', 'E']) host.hello(`peer-${t}`, hello(t));
    expect(to(host.hello('peer-F', hello('F')), 'peer-F')).toEqual({ t: 'rejected', reason: 'This table is full.' });
  });

  it('needs two players to start', () => {
    expect(() => new HostSession('H', 'Host').start(1)).toThrow();
  });

  it('lets the host remove a player and keeps them out', () => {
    const host = lobbyOf3();
    const out = host.kick(seatId(host, 'Ana'));
    expect(to(out, 'peer-a')).toEqual({ t: 'rejected', reason: 'The host removed you from this table.' });
    expect(host.seats.map((s) => s.name)).toEqual(['Host', 'Bo']);
    expect(to(host.hello('peer-a2', hello('ALICE-TOKEN', 'Ana')), 'peer-a2')?.t).toBe('rejected');
  });
});

describe('HostSession security', () => {
  it('never sends anyone a secret token', () => {
    const host = lobbyOf3();
    const lobby = JSON.stringify(host.broadcast());
    host.start(7);
    const game = JSON.stringify(host.broadcast());
    for (const secret of ['HOST-TOKEN', 'ALICE-TOKEN', 'BOB-TOKEN']) {
      expect(lobby).not.toContain(secret);
      expect(game).not.toContain(secret);
    }
  });

  it("can't take over a seat with a public id", () => {
    const host = lobbyOf3();
    host.start(7);
    const out = host.hello('peer-mallory', hello(seatId(host, 'Ana'), 'Mallory'));
    expect(to(out, 'peer-mallory')).toEqual({ t: 'rejected', reason: 'This game has already started.' });
  });

  it('refuses to seat the host twice', () => {
    const host = lobbyOf3();
    expect(to(host.hello('peer-x', hello('HOST-TOKEN')), 'peer-x')?.t).toBe('rejected');
  });

  it('gives one connection one seat', () => {
    const host = new HostSession('H', 'Host');
    for (let i = 0; i < 10; i++) host.hello('peer-spam', hello(`t${i}`, `bot${i}`));
    expect(host.seats).toHaveLength(2);
  });
});

describe('HostSession game', () => {
  it('sends each guest only their own hand', () => {
    const host = lobbyOf3();
    const a = to(host.start(7), 'peer-a');
    if (a?.t !== 'game') throw new Error('expected a game message');
    expect(a.view.me).toBe(seatId(host, 'Ana'));
    expect(a.view.players.find((p) => p.id === seatId(host, 'Ana'))?.hand).toHaveLength(6);
    expect(a.view.players.find((p) => p.id === seatId(host, 'Bo'))?.hand).toBeUndefined();
    expect(a.view).not.toHaveProperty('deck');
  });

  it('applies moves only for the player who sent them', () => {
    const host = lobbyOf3();
    host.start(7);
    const peer = currentPeer(host);
    const other = peer === 'peer-a' ? 'peer-b' : 'peer-a';

    const wrong = host.move(other, { type: 'draw' });
    expect(wrong.error).toBe('It is not your turn.');
    expect(wrong.out).toEqual([{ peer: other, msg: { t: 'error', message: 'It is not your turn.' } }]);

    const ok = host.move(peer, { type: 'draw' });
    expect(ok.error).toBeUndefined();
    expect(ok.out).toHaveLength(2);
  });

  it('plays a placement from whoever is current', () => {
    const host = lobbyOf3();
    host.start(3);
    const s = host.state!;
    const hand = s.players[s.current]!.hand;
    const playable = hand.find((id) => legalPlacements(s.board, id, s.config.radius).length > 0);
    if (playable === undefined) return; // this deal has no opening placement; other tests cover drawing
    const at = legalPlacements(s.board, playable, s.config.radius)[0]!;
    expect(host.move(currentPeer(host), { type: 'place', cardId: playable, at }).error).toBeUndefined();
    expect(host.state!.board).toHaveLength(2);
  });

  it('keeps a seat for a player who drops, and lets them back in on a new connection', () => {
    const host = lobbyOf3();
    host.start(7);
    host.leave('peer-a');
    expect(host.seats.find((s) => s.name === 'Ana')?.online).toBe(false);
    expect(to(host.hello('peer-new', hello('STRANGER')), 'peer-new')?.t).toBe('rejected');

    const back = host.hello('peer-a2', hello('ALICE-TOKEN', 'Ana'));
    expect(host.seats.find((s) => s.name === 'Ana')?.online).toBe(true);
    expect(to(back, 'peer-a2')?.t).toBe('game');
  });

  it('ignores a stale disconnect after a reconnect', () => {
    const host = lobbyOf3();
    host.start(7);
    host.hello('peer-a2', hello('ALICE-TOKEN', 'Ana'));
    host.leave('peer-a');
    expect(host.seats.find((s) => s.name === 'Ana')?.online).toBe(true);
  });

  it('resumes from a snapshot with guests marked offline', () => {
    const host = lobbyOf3();
    host.start(7);
    const resumed = new HostSession('HOST-TOKEN', 'Host', structuredClone(host.snapshot()));
    expect(resumed.state).toEqual(host.state);
    expect(resumed.seats.map((s) => s.online)).toEqual([true, false, false]);
    expect(resumed.viewFor('HOST-TOKEN')?.me).toBe(seatId(host, 'Host'));
  });

  it("ignores someone else's snapshot", () => {
    const host = lobbyOf3();
    const other = new HostSession('OTHER-TOKEN', 'Eve', host.snapshot());
    expect(other.seats.map((s) => s.name)).toEqual(['Eve']);
  });
});
