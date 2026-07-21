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
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

  // Not exhaustive yet (per SRS §9.16 — grows module-by-module) — accurate
  // for what's decorated so far, starting with auth, since packages/types'
  // generated client (see packages/types/scripts/generate-client.ts) reads
  // this spec directly and a wrong/missing shape there is worse than an
  // incomplete one.
  const openApiConfig = new DocumentBuilder()
    .setTitle('Nestora API')
    .setDescription('Society Management Platform — auto-generated from NestJS decorators, not hand-maintained')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup('api/docs', app, openApiDocument);

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  console.log(`[api] listening on :${port}`);
  console.log(`[api] OpenAPI docs at :${port}/api/docs (raw spec: /api/docs-json)`);
}
bootstrap();
