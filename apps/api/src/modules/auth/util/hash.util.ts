import { createHash, randomInt } from 'node:crypto';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Cryptographically-random 6-digit OTP, zero-padded. */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}
