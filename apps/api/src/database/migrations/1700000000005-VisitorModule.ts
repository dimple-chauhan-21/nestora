import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SRS Module 4 tables.
 *
 * `visitors` is deliberately NOT society-scoped — the SRS describes it as "a
 * light global directory to speed repeat entries" (the same visitor phone
 * number recurs across different societies, e.g. a courier or a relative
 * visiting multiple properties). No RLS here by design.
 *
 * `visitor_visits` uses the exact DDL from SRS §10.3 (already denormalizes
 * society_id directly, partitioned by created_at with a composite PK). Since
 * it's partitioned with a composite (id, created_at) PK, nothing downstream
 * (gate_logs) takes a hard FK reference to it — see the security-guard
 * migration's comment on that.
 *
 * `guest_invites` denormalizes society_id (not in the SRS's own column list
 * for this table, but required to keep the RLS convention direct rather than
 * introducing a flat_id-only policy) — same precedent as the resident module.
 */
export class VisitorModule1700000000005 implements MigrationInterface {
  name = 'VisitorModule1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE visitors (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone VARCHAR(15),
        name VARCHAR(255),
        photo_url TEXT,
        id_proof_type VARCHAR(30),
        id_proof_number VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
    `);
    await queryRunner.query(`CREATE INDEX idx_visitors_phone ON visitors(phone) WHERE deleted_at IS NULL;`);

    await queryRunner.query(`
      CREATE TABLE visitor_visits (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        visitor_id UUID NOT NULL REFERENCES visitors(id),
        flat_id UUID NOT NULL REFERENCES flats(id),
        visit_type VARCHAR(20) NOT NULL,
        purpose VARCHAR(255),
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        qr_code TEXT,
        valid_from TIMESTAMPTZ,
        valid_to TIMESTAMPTZ,
        approved_by UUID REFERENCES users(id),
        approved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (id, created_at),
        CONSTRAINT chk_visit_type CHECK (visit_type IN ('walk_in', 'pre_approved', 'recurring')),
        CONSTRAINT chk_visit_status CHECK (
          status IN ('pending', 'approved', 'rejected', 'checked_in', 'checked_out', 'expired')
        )
      ) PARTITION BY RANGE (created_at);
    `);
    await queryRunner.query(`CREATE TABLE visitor_visits_default PARTITION OF visitor_visits DEFAULT;`);
    await queryRunner.query(
      `CREATE INDEX idx_visitor_visits_flat ON visitor_visits(flat_id, created_at DESC);`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_visitor_visits_society_status ON visitor_visits(society_id, status);`,
    );
    await queryRunner.query(`ALTER TABLE visitor_visits ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON visitor_visits
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE guest_invites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        flat_id UUID NOT NULL REFERENCES flats(id),
        created_by_resident_id UUID NOT NULL REFERENCES residents(id),
        guest_name VARCHAR(255) NOT NULL,
        guest_phone VARCHAR(15),
        valid_from TIMESTAMPTZ NOT NULL,
        valid_to TIMESTAMPTZ NOT NULL,
        recurrence_rule TEXT,
        qr_token TEXT NOT NULL UNIQUE,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT chk_guest_invite_dates CHECK (valid_to > valid_from)
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_guest_invites_society ON guest_invites(society_id) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(`ALTER TABLE guest_invites ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON guest_invites
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE visitor_blacklist (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        phone VARCHAR(15),
        name VARCHAR(255),
        id_proof_number VARCHAR(50),
        reason TEXT NOT NULL,
        added_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT chk_blacklist_identity CHECK (
          phone IS NOT NULL OR name IS NOT NULL OR id_proof_number IS NOT NULL
        )
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_visitor_blacklist_society_phone ON visitor_blacklist(society_id, phone) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(`ALTER TABLE visitor_blacklist ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON visitor_blacklist
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS visitor_blacklist;`);
    await queryRunner.query(`DROP TABLE IF EXISTS guest_invites;`);
    await queryRunner.query(`DROP TABLE IF EXISTS visitor_visits_default;`);
    await queryRunner.query(`DROP TABLE IF EXISTS visitor_visits;`);
    await queryRunner.query(`DROP TABLE IF EXISTS visitors;`);
  }
}
