/**
 * Secrets and signatures for online rooms.
 *
 * An invite link carries two things after the `#` (so it never reaches a server):
 * - a random room secret, used as the Trystero room id and password, so only
 *   people with the link can find or join the room;
 * - the host's ECDSA P-256 public key. The host signs every message it sends,
 *   and guests drop anything that isn't signed by that key.
 */

const SIGN = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const HASH = { name: 'ECDSA', hash: 'SHA-256' } as const;

export function toB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const B64URL = /^[A-Za-z0-9_-]+$/;

/** 128 random bits. */
export const randomSecret = (): string => toB64url(crypto.getRandomValues(new Uint8Array(16)));

export interface Invite {
  secret: string;
  hostKey: string;
}

const SECRET_LENGTH = 22; // 16 bytes
const KEY_LENGTH = 87; // 65-byte uncompressed P-256 point

export function inviteFragment(invite: Invite): string {
  return `#join=${invite.secret}.${invite.hostKey}`;
}

/** Read an invite from a link, a fragment, or a pasted `join=…` string. */
export function parseInvite(text: string): Invite | null {
  const match = /join=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/.exec(text.trim());
  if (!match) return null;
  const [, secret, hostKey] = match;
  if (secret!.length !== SECRET_LENGTH || hostKey!.length !== KEY_LENGTH) return null;
  if (!B64URL.test(secret!) || !B64URL.test(hostKey!)) return null;
  return { secret: secret!, hostKey: hostKey! };
}

export interface HostKeys {
  /** Kept in the host's own browser so a reload can resume signing. */
  privateJwk: JsonWebKey;
  publicKey: string;
}

export async function generateHostKeys(): Promise<HostKeys> {
  const pair = await crypto.subtle.generateKey(SIGN, true, ['sign', 'verify']);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicKey = toB64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  return { privateJwk, publicKey };
}

export const importSigningKey = (jwk: JsonWebKey): Promise<CryptoKey> =>
  crypto.subtle.importKey('jwk', jwk, SIGN, false, ['sign']);

export const importVerifyKey = (publicKey: string): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', fromB64url(publicKey), SIGN, false, ['verify']);

const encoder = new TextEncoder();

/** A host message as it travels: the JSON text and its signature. */
export interface Envelope {
  p: string;
  s: string;
}

/** Sign `msg` for one recipient peer, so it can't be replayed to anybody else. */
export async function seal(key: CryptoKey, to: string, msg: unknown): Promise<Envelope> {
  const p = JSON.stringify({ to, msg });
  const s = toB64url(new Uint8Array(await crypto.subtle.sign(HASH, key, encoder.encode(p))));
  return { p, s };
}

const MAX_ENVELOPE = 256 * 1024;

/** The message inside `data` if the host signed it for peer `me`; otherwise null. */
export async function open(key: CryptoKey, me: string, data: unknown): Promise<unknown> {
  if (typeof data !== 'object' || data === null) return null;
  const { p, s } = data as Partial<Envelope>;
  if (typeof p !== 'string' || typeof s !== 'string' || p.length > MAX_ENVELOPE || !B64URL.test(s)) return null;
  let ok = false;
  try {
    ok = await crypto.subtle.verify(HASH, key, fromB64url(s), encoder.encode(p));
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const body = JSON.parse(p) as { to?: unknown; msg?: unknown };
    return body.to === me ? body.msg : null;
  } catch {
    return null;
  }
}
