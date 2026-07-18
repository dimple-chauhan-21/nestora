// Same reasoning as main.ts: this file reads process.env directly, with no
// framework in between to load .env first — must come before anything else.
import 'dotenv/config';
import 'reflect-metadata';
import { join } from 'node:path';
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'postgres',
  // Deliberately MIGRATION_DATABASE_URL, not DATABASE_URL — this CLI (and
  // the seed script, which imports this same DataSource) runs as the
  // owning/admin role. DATABASE_URL is what the running API connects as
  // (app_write_role, a non-owner, for RLS to actually apply) — conflating
  // the two here would let the migration runner create tables it can't
  // then GRANT on, or silently point the app at the wrong role.
  url:
    process.env.MIGRATION_DATABASE_URL ?? 'postgres://nestora:nestora@localhost:5433/society_dev',
  // Glob-based discovery — same reasoning as app.module.ts's TypeOrmModule.
  // This file is run directly via ts-node (typeorm-ts-node-commonjs), so
  // __dirname here is src/database at dev-time and dist/database once built;
  // the glob resolves correctly either way.
  entities: [join(__dirname, 'entities', '**', '*.entity{.ts,.js}')],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
