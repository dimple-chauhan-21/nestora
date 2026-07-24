import { BadRequestException } from '@nestjs/common';

/**
 * Keyset cursor for `created_at DESC, id DESC` pagination — the ordering
 * every cursor-paginated list in this app uses (§11.1). `created_at` alone
 * isn't unique enough to resume from, hence the `id` tiebreaker.
 */
export interface KeysetCursor {
  createdAt: string;
  id: string;
}

export function encodeCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): KeysetCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as KeysetCursor).createdAt !== 'string' ||
      typeof (parsed as KeysetCursor).id !== 'string'
    ) {
      throw new Error('malformed cursor');
    }
    return parsed as KeysetCursor;
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}
