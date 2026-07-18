import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SRS Module 2 tables. `societies`/`flats` already have every §2 column from
 * the Phase 0 baseline migration (verified, not assumed) — only `towers`
 * needed a real alter (`total_floors`). RLS follows the same direct
 * `society_id = current_setting(...)` pattern as `flats`/`user_roles`.
 */
export class SocietyModule1700000000003 implements MigrationInterface {
  name = 'SocietyModule1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE towers ADD COLUMN total_floors INT;`);

    await queryRunner.query(`
      CREATE TABLE society_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL UNIQUE REFERENCES societies(id),
        billing_cycle_day INT NOT NULL DEFAULT 1 CHECK (billing_cycle_day BETWEEN 1 AND 28),
        late_fee_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
        fiscal_year_start_month INT NOT NULL DEFAULT 4 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
        feature_flags JSONB NOT NULL DEFAULT '{}',
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
    `);
    await queryRunner.query(`ALTER TABLE society_settings ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON society_settings
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE amenities_master (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        name VARCHAR(100) NOT NULL,
        type VARCHAR(50),
        capacity INT,
        booking_required BOOLEAN NOT NULL DEFAULT false,
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_amenities_master_society ON amenities_master(society_id) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(`ALTER TABLE amenities_master ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON amenities_master
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE society_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        doc_type VARCHAR(50) NOT NULL,
        file_url TEXT NOT NULL,
        version INT NOT NULL DEFAULT 1,
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_society_documents_society ON society_documents(society_id) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(`ALTER TABLE society_documents ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON society_documents
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE emergency_contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        name VARCHAR(255) NOT NULL,
        category VARCHAR(20) NOT NULL,
        phone VARCHAR(15) NOT NULL,
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT chk_emergency_contact_category CHECK (category IN ('police', 'fire', 'hospital', 'office'))
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_emergency_contacts_society ON emergency_contacts(society_id) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(`ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON emergency_contacts
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE society_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        effective_from DATE NOT NULL,
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_society_rules_society ON society_rules(society_id) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(`ALTER TABLE society_rules ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON society_rules
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    // §2 validation: flat_number unique within (society_id, tower_id, floor_number).
    // Phase 0's baseline created UNIQUE (society_id, tower_id, flat_number) —
    // missing floor_number. Find whatever Postgres auto-named that constraint
    // and drop it before adding the corrected one.
    await queryRunner.query(`
      DO $$
      DECLARE
        cname text;
      BEGIN
        SELECT conname INTO cname FROM pg_constraint
          WHERE conrelid = 'flats'::regclass AND contype = 'u'
          AND conname LIKE '%society_id%tower_id%flat_number%';
        IF cname IS NOT NULL THEN
          EXECUTE format('ALTER TABLE flats DROP CONSTRAINT %I', cname);
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE flats ADD CONSTRAINT uq_flats_society_tower_floor_number UNIQUE (society_id, tower_id, floor_number, flat_number);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE flats DROP CONSTRAINT IF EXISTS uq_flats_society_tower_floor_number;`);
    await queryRunner.query(
      `ALTER TABLE flats ADD CONSTRAINT "UQ_flats_society_id_tower_id_flat_number" UNIQUE (society_id, tower_id, flat_number);`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS society_rules;`);
    await queryRunner.query(`DROP TABLE IF EXISTS emergency_contacts;`);
    await queryRunner.query(`DROP TABLE IF EXISTS society_documents;`);
    await queryRunner.query(`DROP TABLE IF EXISTS amenities_master;`);
    await queryRunner.query(`DROP TABLE IF EXISTS society_settings;`);
    await queryRunner.query(`ALTER TABLE towers DROP COLUMN IF EXISTS total_floors;`);
  }
}
