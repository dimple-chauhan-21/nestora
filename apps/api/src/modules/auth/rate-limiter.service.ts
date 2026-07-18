import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.provider';

@Injectable()
export class RateLimiterService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Fixed-window counter: `key` is allowed `limit` hits per `windowSeconds`.
   * Returns true if this call is within the limit (and counts it).
   */
  async allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }
    return count <= limit;
  }
}
