import { describe, expect, it } from 'vitest';
import { cleanName, parseMove, parseToGuest, parseToHost } from './validate.ts';

const TOKEN = 'a'.repeat(32);

describe('parseToHost', () => {
  it('accepts well-formed messages', () => {
    expect(parseToHost({ t: 'hello', token: TOKEN, name: ' Ana ' })).toEqual({ t: 'hello', token: TOKEN, name: 'Ana' });
    expect(parseToHost({ t: 'move', move: { type: 'place', cardId: 3, at: { a: 1, b: -1 }, extra: 1 } })).toEqual({
      t: 'move',
      move: { type: 'place', cardId: 3, at: { a: 1, b: -1 } },
    });
  });

  it('rejects malformed messages', () => {
    for (const bad of [
      null,
      'hello',
      { t: 'hello', token: TOKEN, name: 123 },
      { t: 'hello', token: 'not-a-token', name: 'x' },
      { t: 'hello', token: TOKEN, name: 'x'.repeat(500) },
      { t: 'move', move: { type: 'place', cardId: 3 } },
      { t: 'move', move: { type: 'place', cardId: 64, at: { a: 0, b: 0 } } },
      { t: 'move', move: { type: 'place', cardId: 1.5, at: { a: 0, b: 0 } } },
      { t: 'move', move: { type: 'place', cardId: 1, at: { a: 0.5, b: 0 } } },
      { t: 'move', move: { type: 'teleport' } },
      { t: 'other' },
    ]) {
      expect(parseToHost(bad)).toBeNull();
    }
  });
});

describe('parseMove', () => {
  it('keeps only the fields each move needs', () => {
    expect(parseMove({ type: 'draw', cardId: 5 })).toEqual({ type: 'draw' });
    expect(parseMove({ type: 'discard', cardId: 5 })).toEqual({ type: 'discard', cardId: 5 });
  });
});

describe('cleanName', () => {
  it('strips control and bidi characters and caps the length', () => {
    expect(cleanName('Ev‮il\u0007')).toBe('Evil');
    expect(cleanName('   ')).toBe('Player');
    expect(cleanName('x'.repeat(50))).toHaveLength(20);
  });
});

describe('parseToGuest', () => {
  const seat = { id: '0123456789abcdef', name: 'Ana', online: true, host: true };

  it('accepts a lobby and rejects bad seats', () => {
    expect(parseToGuest({ t: 'lobby', seats: [seat], you: seat.id })).toEqual({ t: 'lobby', seats: [seat], you: seat.id });
    expect(parseToGuest({ t: 'lobby', seats: [{ ...seat, id: 'x' }], you: seat.id })).toBeNull();
    expect(parseToGuest({ t: 'lobby', seats: Array(7).fill(seat), you: seat.id })).toBeNull();
  });

  it('rejects unknown and malformed messages', () => {
    expect(parseToGuest({ t: 'game', seats: [seat], view: null })).toBeNull();
    expect(parseToGuest({ t: 'error', message: 5 })).toBeNull();
    expect(parseToGuest({ t: 'hack' })).toBeNull();
  });
});
