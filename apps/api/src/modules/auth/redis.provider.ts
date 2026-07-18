import { Injectable, OnModuleDestroy, Provider } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Injectable()
export class RedisConnection implements OnModuleDestroy {
  readonly client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}

export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (connection: RedisConnection) => connection.client,
  inject: [RedisConnection],
};
