import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Authenticated symmetric encryption (AES-256-GCM) for secrets that must be *recoverable* — unlike
 * a password, which is only ever hashed. The TOTP shared secret is the case in point: the server
 * has to read it back to check a 6-digit code, so it cannot be a one-way hash, but storing it in
 * clear would hand an attacker who reads the database the ability to mint valid codes.
 *
 * Key management: a dedicated ENCRYPTION_KEY (32-byte hex) is used when provided. Otherwise the key
 * is derived from JWT_ACCESS_SECRET with scrypt and a fixed application salt — so a stock dev setup
 * works out of the box, while a real deployment sets ENCRYPTION_KEY to rotate it independently of
 * the JWT signing key. GCM's auth tag means any tampering with the ciphertext fails decryption
 * loudly rather than yielding garbage.
 */
const ALGORITHM = 'aes-256-gcm';

function resolveKey(): Buffer {
  const configured = env.ENCRYPTION_KEY;
  if (configured) {
    const buf = Buffer.from(configured, 'hex');
    if (buf.length === 32) return buf;
    // Not 32 raw bytes of hex — stretch whatever was given to a stable 32-byte key.
    return scryptSync(configured, 'pawfecthome:enc:v1', 32);
  }
  const seed = env.JWT_ACCESS_SECRET ?? 'pawfecthome-insecure-dev-key';
  return scryptSync(seed, 'pawfecthome:enc:v1', 32);
}

const KEY = resolveKey();

/** Returns `iv.authTag.ciphertext`, all base64url, so the whole thing is one compact string. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit nonce, the GCM standard
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${authTag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

/** Inverse of encrypt. Throws if the ciphertext was tampered with (GCM auth-tag mismatch). */
export function decrypt(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('Malformed ciphertext.');
  const [ivRaw, tagRaw, dataRaw] = parts as [string, string, string];

  const decipher = createDecipheriv(ALGORITHM, KEY, Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataRaw, 'base64url')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
