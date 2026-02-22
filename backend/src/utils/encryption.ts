import CryptoJS from 'crypto-js';
import { env } from '../config/env';

export function encrypt(text: string): string {
  return CryptoJS.AES.encrypt(text, env.ENCRYPTION_KEY).toString();
}

export function decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, env.ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}
