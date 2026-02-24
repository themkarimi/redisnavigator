import { maskKey } from '../utils/maskKey';

describe('maskKey', () => {
  it('masks a single-character key', () => {
    expect(maskKey('a')).toBe('a***');
  });

  it('masks a short key (≤ 3 chars)', () => {
    expect(maskKey('abc')).toBe('a***');
  });

  it('masks a medium key', () => {
    expect(maskKey('session')).toBe('se***');
  });

  it('masks a long key and shows at most 3 visible characters', () => {
    expect(maskKey('user:12345:profile')).toBe('use***');
  });

  it('returns the original value when the key is an empty string', () => {
    expect(maskKey('')).toBe('');
  });

  it('never reveals more than 3 characters', () => {
    const veryLongKey = 'a'.repeat(100);
    const masked = maskKey(veryLongKey);
    const visible = masked.replace('***', '');
    expect(visible.length).toBeLessThanOrEqual(3);
  });
});
