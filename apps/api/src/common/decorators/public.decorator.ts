import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Explicitly opts a route out of the global JwtAuthGuard. Every endpoint is
 * protected by default (CLAUDE.md non-negotiable) — public routes must carry
 * this decorator individually rather than the guard defaulting to open.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
