// lib/auth/password.ts
//
// Password hashing with Node's built-in scrypt (no external deps).
// Format: scrypt$N$r$p$salthex$hashhex — parameters embedded so they can be
// raised later without invalidating existing hashes.
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const N = 16384;
const r = 8;
const p = 1;
const KEYLEN = 64;

export function hashPassword(password: string): string {
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, nStr, rStr, pStr, saltHex, hashHex] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
