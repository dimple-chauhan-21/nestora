export interface EnvConfig {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL: string;
  MIGRATION_DATABASE_URL: string;
  REDIS_URL: string;
  JWT_PRIVATE_KEY_PATH: string;
  JWT_PUBLIC_KEY_PATH: string;
  JWT_ACCESS_TTL_SECONDS: number;
  JWT_REFRESH_TTL_DAYS: number;
  QR_TOKEN_SECRET: string;
  PAYMENT_GATEWAY_WEBHOOK_SECRET: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
}

export function loadEnv(): EnvConfig {
  return {
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    PORT: Number(process.env.PORT ?? 4000),
    // The RUNNING APP's own connection — app_write_role, NOT a table owner,
    // so Postgres RLS actually applies (see KNOWN_GAPS.md's now-resolved
    // entry and TenantConnectionService). Never point this at the owning
    // role: that would silently make RLS inert again, the exact bug this
    // session closed.
    DATABASE_URL:
      process.env.DATABASE_URL ??
      'postgres://app_write_role:app_write_role_dev_password@localhost:5433/society_dev',
    // The migration CLI's and seed script's own connection — the owning/
    // admin role, deliberately separate from DATABASE_URL above. Migrations
    // create tables and GRANT to app_write_role; they can't do that as
    // app_write_role itself (a non-owner can't grant privileges it doesn't
    // have `WITH GRANT OPTION` on, and shouldn't own schema objects anyway).
    MIGRATION_DATABASE_URL:
      process.env.MIGRATION_DATABASE_URL ??
      'postgres://nestora:nestora@localhost:5433/society_dev',
    REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6380',
    JWT_PRIVATE_KEY_PATH: process.env.JWT_PRIVATE_KEY_PATH ?? 'keys/jwt-private.pem',
    JWT_PUBLIC_KEY_PATH: process.env.JWT_PUBLIC_KEY_PATH ?? 'keys/jwt-public.pem',
    JWT_ACCESS_TTL_SECONDS: Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900),
    JWT_REFRESH_TTL_DAYS: Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30),
    // Dev-only fallback so a fresh clone works out of the box; every real
    // environment must set this via Secrets Manager, same as the JWT keys.
    QR_TOKEN_SECRET: process.env.QR_TOKEN_SECRET ?? 'dev-only-qr-secret-do-not-use-in-prod',
    // Simulates the shared secret a real gateway (Razorpay) dashboard would
    // issue for webhook signing. Same dev-only-fallback posture as the other
    // secrets above.
    PAYMENT_GATEWAY_WEBHOOK_SECRET:
      process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET ?? 'dev-only-webhook-secret-do-not-use-in-prod',
    // No dev-only fallback string here, unlike the secrets above — an
    // empty value is the deliberate signal NotificationModule's factory
    // uses to fall back to ConsoleNotificationProvider instead of trying
    // to construct a real (and inevitably broken) Firebase app. Real
    // values come from a downloaded service-account JSON's project_id/
    // client_email/private_key fields.
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ?? '',
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ?? '',
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ?? '',
  };
}
