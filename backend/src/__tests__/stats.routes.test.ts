import { sanitizeRedisConfigValue } from '../routes/stats.routes';

describe('sanitizeRedisConfigValue', () => {
  it('masks requirepass values', () => {
    expect(sanitizeRedisConfigValue('requirepass', 'super-secret')).toBe('[hidden]');
  });

  it('masks masterauth values', () => {
    expect(sanitizeRedisConfigValue('masterauth', 'replica-secret')).toBe('[hidden]');
  });

  it('masks other password-like config keys', () => {
    expect(sanitizeRedisConfigValue('tls-key-file-pass', 'tls-secret')).toBe('[hidden]');
  });

  it('preserves empty sensitive values', () => {
    expect(sanitizeRedisConfigValue('requirepass', '')).toBe('');
  });

  it('preserves non-sensitive config values', () => {
    expect(sanitizeRedisConfigValue('maxmemory', '0')).toBe('0');
  });
});