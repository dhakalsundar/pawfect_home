import bcrypt from 'bcryptjs';

/**
 * 12 rounds: roughly 250ms per hash on typical hardware. Slow enough to make offline brute force
 * expensive, fast enough that login does not feel sluggish.
 */
const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Runs a hash against a throwaway value.
 *
 * Used on the login path when the email does not exist. Without it, a missing user returns in ~2ms
 * while a wrong password takes ~250ms — a timing difference that lets an attacker enumerate which
 * email addresses have accounts.
 */
const DUMMY_HASH = '$2a$12$abcdefghijklmnopqrstuuLZM1p1WvBLZlWZDHNlqEP0Lb2xN1uEy';

export async function fakeCompare(): Promise<void> {
  await bcrypt.compare('not-a-real-password', DUMMY_HASH);
}
