import { Controller, Get, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { WriteThrottlerGuard } from '../src/common/guards/write-throttler.guard';

@Controller('probe')
class ProbeController {
  @Post()
  write() {
    return { ok: true };
  }

  @Get()
  read() {
    return { ok: true };
  }
}

/**
 * Isolated from AppModule on purpose: proves WriteThrottlerGuard's actual
 * throttling behavior (limit enforced on writes, reads exempt) against a
 * tiny, fast, deterministic limit, rather than trying to trip the real
 * app's much higher production limit (120/60s) inside a test run.
 */
describe('WriteThrottlerGuard (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 5_000, limit: 3 }])],
      controllers: [ProbeController],
      providers: [{ provide: APP_GUARD, useClass: WriteThrottlerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows up to the configured limit of write requests, then rejects with 429', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer()).post('/probe').expect(201);
    }
    await request(app.getHttpServer()).post('/probe').expect(429);
  });

  it('never throttles read (GET) requests, even well past the write limit', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer()).get('/probe').expect(200);
    }
  });
});
