import { describe, expect, it } from 'vitest';
import {
  generateHostKeys,
  importSigningKey,
  importVerifyKey,
  inviteFragment,
  open,
  parseInvite,
  randomSecret,
  seal,
} from './crypto.ts';

describe('invites', () => {
  it('round-trips through a link', async () => {
    const { publicKey } = await generateHostKeys();
    const invite = { secret: randomSecret(), hostKey: publicKey };
    expect(parseInvite(`https://example.github.io/triface/${inviteFragment(invite)}`)).toEqual(invite);
    expect(parseInvite(inviteFragment(invite))).toEqual(invite);
  });

  it('rejects malformed or truncated invites', async () => {
    const { publicKey } = await generateHostKeys();
    expect(parseInvite('#join=short.' + publicKey)).toBeNull();
    expect(parseInvite(`#join=${randomSecret()}.${publicKey.slice(1)}`)).toBeNull();
    expect(parseInvite('?room=ABCDE')).toBeNull();
  });
});

describe('signed host messages', () => {
  async function keys() {
    const k = await generateHostKeys();
    return { sign: await importSigningKey(k.privateJwk), verify: await importVerifyKey(k.publicKey) };
  }

  it('opens a message signed for this peer', async () => {
    const { sign, verify } = await keys();
    const env = await seal(sign, 'peer-a', { t: 'error', message: 'hi' });
    expect(await open(verify, 'peer-a', env)).toEqual({ t: 'error', message: 'hi' });
  });

  it('refuses a message signed for someone else (no replay between players)', async () => {
    const { sign, verify } = await keys();
    const env = await seal(sign, 'peer-a', { t: 'rejected', reason: 'x' });
    expect(await open(verify, 'peer-b', env)).toBeNull();
  });

  it('refuses tampered messages and other keys', async () => {
    const { sign, verify } = await keys();
    const env = await seal(sign, 'peer-a', { t: 'error', message: 'hi' });
    expect(await open(verify, 'peer-a', { ...env, p: env.p.replace('hi', 'yo') })).toBeNull();
    const impostor = await keys();
    const forged = await seal(impostor.sign, 'peer-a', { t: 'error', message: 'hi' });
    expect(await open(verify, 'peer-a', forged)).toBeNull();
  });

  it('refuses junk without throwing', async () => {
    const { verify } = await keys();
    for (const junk of [null, 1, 'x', [], { p: 1, s: 2 }, { p: '{}', s: '!!' }, { p: 'x'.repeat(300_000), s: 'AA' }]) {
      expect(await open(verify, 'peer-a', junk)).toBeNull();
    }
  });
});
