// Must run before any other local import — app.module.ts (and everything it
// imports, e.g. NotificationModule) reads process.env at module-body-eval
// time via loadEnv(), which happens during this import graph's resolution.
// ConfigModule.forRoot()'s own dotenv loading runs too late for that (it's
// inside the @Module() decorator, evaluated after this file's imports are
// already resolved) — this was silently masking every .env value that
// doesn't have a matching dev-fallback default (FIREBASE_* had none).
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true makes req.rawBody (the original Buffer) available —
  // required for webhook HMAC verification, which must check the exact
  // bytes a gateway signed, not a JSON.parse'd-and-reserialized copy.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  console.log(`[api] listening on :${port}`);
}
bootstrap();
