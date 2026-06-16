import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import * as otplib from 'otplib';
import QRCode from 'qrcode';

/**
 * Thin wrapper over otplib (RFC 6238 TOTP) so the rest of the app never touches the library API
 * directly. A standard 30-second, 6-digit authenticator code — compatible with Google Authenticator,
 * Authy, 1Password, etc.
 */
const ISSUER = 'PawfectHome';

export function generateTotpSecret(): string {
  return otplib.generateSecret();
}

/** The otpauth:// URI an authenticator app scans. Encodes issuer + account so the entry is labelled. */
export function totpAuthUri(secret: string, account: string): string {
  return otplib.generateURI({ secret, label: account, issuer: ISSUER });
}

/** Renders the otpauth URI to a PNG data URI for display as a QR code. */
export function totpQrDataUri(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, { margin: 1, width: 220 });
}

/**
 * Verifies a 6-digit code against the secret. A small window absorbs clock skew between the server
 * and the user's phone. Whitespace is stripped so "123 456" from an app still matches.
 */
export function verifyTotp(secret: string, token: string): boolean {
  const normalised = token.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalised)) return false;
  const result = otplib.verifySync({ token: normalised, secret });
  return result.valid === true;
}

// --- Backup codes ------------------------------------------------------------

/** SHA-256 is enough here: backup codes are high-entropy random, not human-memorable secrets. */
function hashCode(code: string): string {
  return createHash('sha256').update(code.toUpperCase()).digest('hex');
}

/** Ten single-use recovery codes, formatted `XXXX-XXXX`. Returned once; only hashes are stored. */
export function generateBackupCodes(count = 10): { plain: string[]; hashed: string[] } {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const plain: string[] = [];
  for (let i = 0; i < count; i += 1) {
    let raw = '';
    for (let j = 0; j < 8; j += 1) raw += alphabet[randomInt(alphabet.length)];
    plain.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return { plain, hashed: plain.map(hashCode) };
}

/**
 * Returns the matching stored hash if `code` is a valid unused backup code, else null. Constant-time
 * per candidate so a timing side-channel does not reveal which code was close.
 */
export function matchBackupCode(code: string, hashed: string[]): string | null {
  const candidate = hashCode(code.replace(/\s+/g, ''));
  const candidateBuf = Buffer.from(candidate);
  for (const stored of hashed) {
    const storedBuf = Buffer.from(stored);
    if (storedBuf.length === candidateBuf.length && timingSafeEqual(storedBuf, candidateBuf)) {
      return stored;
    }
  }
  return null;
}

/** Test-only: a valid current code for a secret, so the verify path can be exercised end-to-end. */
export function __currentTotpForTest(secret: string): string {
  return otplib.generateSync({ secret });
}
