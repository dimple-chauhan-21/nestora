import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SRS Module 3 tables. None of these carry `society_id` in the SRS §6 column
 * list (they're scoped via `flat_id`/`resident_id`, 1-3 hops from `flats`).
 * Per the session's RLS decision: `society_id` is denormalized onto every
 * table here (set once at insert from flats.society_id, never updated after
 * — a flat never changes society in this domain model) so every RLS policy
 * in the codebase stays the same simple direct-comparison shape instead of
 * introducing 2-3-level-deep subquery policies for this module only.
 */
export class ResidentModule1700000000004 implements MigrationInterface {
  name = 'ResidentModule1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE residents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        flat_id UUID NOT NULL REFERENCES flats(id),
        -- Nullable: guardian-managed sub-profiles (children, dependents
        -- without a personal phone) per SRS Module 1/3 edge cases don't
        -- necessarily get their own users row.
        user_id UUID REFERENCES users(id),
        relation_type VARCHAR(20) NOT NULL,
        is_senior_citizen BOOLEAN NOT NULL DEFAULT false,
        is_child BOOLEAN NOT NULL DEFAULT false,
        move_in_date DATE,
        move_out_date DATE,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT chk_resident_relation_type CHECK (relation_type IN ('owner', 'tenant', 'family')),
        CONSTRAINT chk_resident_status CHECK (status IN ('active', 'suspended', 'moved_out'))
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_residents_flat ON residents(flat_id) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_residents_society ON residents(society_id) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(`ALTER TABLE residents ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON residents
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE lease_details (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        resident_id UUID NOT NULL REFERENCES residents(id),
        lease_start DATE NOT NULL,
        lease_end DATE NOT NULL,
        monthly_rent NUMERIC(12,2),
        deposit_amount NUMERIC(12,2),
        currency CHAR(3) NOT NULL DEFAULT 'INR',
        agreement_doc_id UUID,
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT chk_lease_dates CHECK (lease_end > lease_start)
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_lease_details_resident ON lease_details(resident_id) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_lease_details_lease_end ON lease_details(lease_end) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(`ALTER TABLE lease_details ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON lease_details
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE vehicles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        flat_id UUID NOT NULL REFERENCES flats(id),
        owner_resident_id UUID NOT NULL REFERENCES residents(id),
        type VARCHAR(20) NOT NULL,
        registration_number VARCHAR(20) NOT NULL,
        rc_doc_url TEXT,
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT chk_vehicle_type CHECK (type IN ('car', 'bike'))
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_vehicles_flat ON vehicles(flat_id) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(`ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON vehicles
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE pets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        flat_id UUID NOT NULL REFERENCES flats(id),
        name VARCHAR(100) NOT NULL,
        species VARCHAR(50) NOT NULL,
        vaccination_doc_url TEXT,
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
    `);
    await queryRunner.query(`CREATE INDEX idx_pets_flat ON pets(flat_id) WHERE deleted_at IS NULL;`);
    await queryRunner.query(`ALTER TABLE pets ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON pets
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE resident_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        resident_id UUID NOT NULL REFERENCES residents(id),
        doc_type VARCHAR(30) NOT NULL,
        file_url TEXT NOT NULL,
        verified_at TIMESTAMPTZ,
        verified_by UUID REFERENCES users(id),
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT chk_resident_doc_type CHECK (doc_type IN ('id_proof', 'agreement', 'photo'))
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_resident_documents_resident ON resident_documents(resident_id) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(`ALTER TABLE resident_documents ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON resident_documents
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE resident_emergency_contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        resident_id UUID NOT NULL REFERENCES residents(id),
        name VARCHAR(255) NOT NULL,
        relation VARCHAR(50) NOT NULL,
        phone VARCHAR(15) NOT NULL,
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_resident_emergency_contacts_resident ON resident_emergency_contacts(resident_id) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(`ALTER TABLE resident_emergency_contacts ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON resident_emergency_contacts
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    // override_reason/overridden_by aren't in SRS's column list but are
    // required to implement the spec's own validation rule ("move-out
    // blocked if dues_cleared=false unless admin overrides with reason").
    await queryRunner.query(`
      CREATE TABLE move_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        flat_id UUID NOT NULL REFERENCES flats(id),
        resident_id UUID NOT NULL REFERENCES residents(id),
        event_type VARCHAR(20) NOT NULL,
        checklist_json JSONB NOT NULL DEFAULT '{}',
        dues_cleared BOOLEAN NOT NULL DEFAULT false,
        override_reason TEXT,
        overridden_by UUID REFERENCES users(id),
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT chk_move_event_type CHECK (event_type IN ('move_in', 'move_out'))
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_move_events_flat ON move_events(flat_id) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(`ALTER TABLE move_events ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON move_events
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS move_events;`);
    await queryRunner.query(`DROP TABLE IF EXISTS resident_emergency_contacts;`);
    await queryRunner.query(`DROP TABLE IF EXISTS resident_documents;`);
    await queryRunner.query(`DROP TABLE IF EXISTS pets;`);
    await queryRunner.query(`DROP TABLE IF EXISTS vehicles;`);
    await queryRunner.query(`DROP TABLE IF EXISTS lease_details;`);
    await queryRunner.query(`DROP TABLE IF EXISTS residents;`);
  }
}
