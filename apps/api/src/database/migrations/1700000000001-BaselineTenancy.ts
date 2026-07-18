import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SRS §10.3 tenancy backbone + identity: companies, societies, towers
 * (minimal — flats.tower_id needs a real FK target; Module 2 owns the full
 * definition), flats, users. RLS proof-of-pattern (§10.5) applied to `flats`.
 *
 * `users`/`companies` intentionally omit created_by/updated_by — SRS 10.3
 * defines them without those columns (first user can't reference itself as
 * creator), so we follow the spec literally rather than inventing columns.
 */
export class BaselineTenancy1700000000001 implements MigrationInterface {
  name = 'BaselineTenancy1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    await queryRunner.query(`
      CREATE TABLE companies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        plan_id UUID,
        billing_status VARCHAR(20) NOT NULL DEFAULT 'active',
        branding JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
    `);

    await queryRunner.query(`
      CREATE TABLE societies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES companies(id),
        name VARCHAR(255) NOT NULL,
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        pincode VARCHAR(10),
        geo_lat NUMERIC(9,6),
        geo_lng NUMERIC(9,6),
        timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
        currency CHAR(3) NOT NULL DEFAULT 'INR',
        registration_number VARCHAR(100),
        branding JSONB DEFAULT '{}',
        created_by UUID,
        updated_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_societies_company ON societies(company_id) WHERE deleted_at IS NULL;`,
    );

    await queryRunner.query(`
      CREATE TABLE towers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        name VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
    `);

    await queryRunner.query(`
      CREATE TABLE flats (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        tower_id UUID REFERENCES towers(id),
        floor_number INT,
        flat_number VARCHAR(20) NOT NULL,
        type VARCHAR(30),
        area_sqft NUMERIC(8,2),
        status VARCHAR(20) NOT NULL DEFAULT 'vacant',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        UNIQUE (society_id, tower_id, flat_number)
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_flats_society ON flats(society_id) WHERE deleted_at IS NULL;`,
    );

    await queryRunner.query(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone VARCHAR(15) UNIQUE,
        email VARCHAR(255) UNIQUE,
        password_hash TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending_verification',
        phone_verified_at TIMESTAMPTZ,
        email_verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT chk_identity CHECK (phone IS NOT NULL OR email IS NOT NULL)
      );
    `);

    // societies.created_by/updated_by and flats' future owner FKs point at
    // users(id); users must exist first, so we add those FKs now that both
    // tables are in place.
    await queryRunner.query(
      `ALTER TABLE societies ADD CONSTRAINT fk_societies_created_by FOREIGN KEY (created_by) REFERENCES users(id);`,
    );
    await queryRunner.query(
      `ALTER TABLE societies ADD CONSTRAINT fk_societies_updated_by FOREIGN KEY (updated_by) REFERENCES users(id);`,
    );

    // RLS proof-of-pattern (§10.5) on a tenant-scoped table.
    await queryRunner.query(`ALTER TABLE flats ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON flats
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS tenant_isolation ON flats;`);
    await queryRunner.query(`ALTER TABLE flats DISABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`DROP TABLE IF EXISTS flats;`);
    await queryRunner.query(`DROP TABLE IF EXISTS towers;`);
    await queryRunner.query(
      `ALTER TABLE societies DROP CONSTRAINT IF EXISTS fk_societies_created_by;`,
    );
    await queryRunner.query(
      `ALTER TABLE societies DROP CONSTRAINT IF EXISTS fk_societies_updated_by;`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS users;`);
    await queryRunner.query(`DROP TABLE IF EXISTS societies;`);
    await queryRunner.query(`DROP TABLE IF EXISTS companies;`);
  }
}
