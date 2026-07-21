import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';

/**
 * Dumps the OpenAPI spec to a file without ever calling app.listen() —
 * packages/types' client-generation step (openapi-typescript) reads this
 * file, so generating a typed client never depends on a dev server already
 * being up, and stays reproducible in CI.
 */
async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  // Must match main.ts's bootstrap exactly — otherwise the generated paths
  // (e.g. /auth/otp/verify instead of the real /api/v1/auth/otp/verify)
  // silently don't match what the running server actually serves.
  app.setGlobalPrefix('api/v1');

  const openApiConfig = new DocumentBuilder()
    .setTitle('Nestora API')
    .setDescription('Society Management Platform — auto-generated from NestJS decorators, not hand-maintained')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, openApiConfig);

  const outPath = join(__dirname, '..', 'openapi.json');
  writeFileSync(outPath, JSON.stringify(document, null, 2));
  console.log(`[export-openapi] wrote ${outPath}`);

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
