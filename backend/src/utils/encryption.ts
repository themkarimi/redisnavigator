import crypto from 'crypto';
import CryptoJS from 'crypto-js';
import { env } from '../config/env';

// Prefix used to tag ciphertexts produced with AES-256-GCM. Values without
// this prefix are assumed to be legacy CryptoJS AES (OpenSSL format) and are
// decrypted via the compatibility path so existing stored passwords continue
// to work after the upgrade. New writes always use AES-256-GCM.
const GCM_PREFIX = 'v2:';

function getKey(): Buffer {
  // Derive a deterministic 32-byte key from ENCRYPTION_KEY. Using SHA-256
  // guarantees the key material is exactly 32 bytes even if the operator
  // configures a longer or shorter passphrase; production startup validation
  // additionally enforces a 32-byte key (see env.ts).
  return crypto.createHash('sha256').update(env.ENCRYPTION_KEY, 'utf8').digest();
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Layout: v2:<base64(iv | authTag | ciphertext)>
  return GCM_PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decrypt(value: string): string {
  if (value.startsWith(GCM_PREFIX)) {
    const payload = Buffer.from(value.slice(GCM_PREFIX.length), 'base64');
    if (payload.length < 12 + 16) {
      throw new Error('Invalid ciphertext');
    }
    const iv = payload.subarray(0, 12);
    const authTag = payload.subarray(12, 28);
    const ciphertext = payload.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  }

  // Legacy CryptoJS AES (OpenSSL passphrase format). Values written before
  // the AES-GCM migration fall through this branch. They remain readable so
  // existing Redis connections keep working; the next write re-encrypts them
  // under AES-256-GCM automatically.
  const bytes = CryptoJS.AES.decrypt(value, env.ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}
