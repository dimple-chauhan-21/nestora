import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Global default rate limit for mutating requests only — GET/HEAD are
 * skipped since the abuse case this guards against is a compromised token
 * hammering write endpoints (spamming complaints, bookings, deliveries),
 * not read traffic. OTP request/verify already have their own dedicated,
 * stricter Redis-backed limiter (RateLimiterService) keyed by phone number;
 * this guard applies underneath that as a second, coarser backstop covering
 * every other write endpoint, which today has no limiting at all.
 *
 * Tracked per authenticated user (JwtAuthGuard runs before this guard in
 * AppModule's provider order, so `request.user` is already populated),
 * falling back to IP only for the handful of @Public() write routes (OTP
 * verify, guard login) where no user identity exists yet.
 */
@Injectable()
export class WriteThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    return !MUTATING_METHODS.has(request.method);
  }

  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { userId?: string } | undefined;
    return user?.userId ?? (req.ip as string | undefined) ?? 'unknown';
  }
}
