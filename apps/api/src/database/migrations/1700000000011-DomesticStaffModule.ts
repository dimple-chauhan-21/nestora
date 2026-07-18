import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SRS Module 7 tables.
 *
 * `domestic_staff` is a global directory keyed by phone — same precedent as
 * `visitors` (Module 4): one maid can work across multiple societies on this
 * platform, so the staff record itself carries no society_id and has no RLS.
 * Per-society/per-flat assignment lives entirely in `staff_flat_mapping`.
 *
 * `police_verification_doc_url`/`police_verification_status` live directly on
 * `domestic_staff` per §6's own column list (not deferred to Module 21,
 * which isn't built yet) — access to them is gated at the application layer
 * (Society Admin/Manager only), the same `is_sensitive`-style posture §21
 * describes, so this doesn't need reworking when Module 21 lands.
 *
 * `staff_attendance` is explicitly called out in §10.4's partitioning list
 * ("Tables partitioned by month... staff_attendance") alongside
 * visitor_visits/gate_logs/audit_logs — partitioned by RANGE(date), same
 * composite-PK-plus-default-partition shape as those tables. `date` is
 * already part of the natural idempotency key (staff_id, flat_id, date), so
 * no extra column is needed to satisfy Postgres's "unique constraint must
 * include the partition key" rule.
 */
export class DomesticStaffModule1700000000011 implements MigrationInterface {
  name = 'DomesticStaffModule1700000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE domestic_staff (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone VARCHAR(15) NOT NULL,
        name VARCHAR(255) NOT NULL,
        photo_url TEXT,
        staff_type VARCHAR(20) NOT NULL,
        police_verification_doc_url TEXT,
        police_verification_status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT chk_staff_type CHECK (staff_type IN ('maid', 'driver', 'cook', 'cleaner', 'caretaker')),
        CONSTRAINT chk_police_verification_status CHECK (
          police_verification_status IN ('pending', 'verified', 'rejected')
        )
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_domestic_staff_phone ON domestic_staff(phone) WHERE deleted_at IS NULL;`,
    );

    await queryRunner.query(`
      CREATE TABLE staff_flat_mapping (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        staff_id UUID NOT NULL REFERENCES domestic_staff(id),
        flat_id UUID NOT NULL REFERENCES flats(id),
        monthly_salary NUMERIC(12,2) CHECK (monthly_salary >= 0),
        work_days JSONB,
        active BOOLEAN NOT NULL DEFAULT true,
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
    `);
    // Partial unique index, not a table-wide UNIQUE: a staff member can be
    // unmapped and later re-mapped to the same flat — history (the old
    // inactive row) must survive, only one ACTIVE mapping per pair at a time.
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_staff_flat_mapping_active ON staff_flat_mapping(staff_id, flat_id) WHERE active = true;
    `);
    await queryRunner.query(
      `CREATE INDEX idx_staff_flat_mapping_flat ON staff_flat_mapping(flat_id) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(`ALTER TABLE staff_flat_mapping ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON staff_flat_mapping
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE staff_attendance (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        staff_id UUID NOT NULL REFERENCES domestic_staff(id),
        flat_id UUID NOT NULL REFERENCES flats(id),
        date DATE NOT NULL,
        check_in_time TIMESTAMPTZ,
        check_out_time TIMESTAMPTZ,
        verification_method VARCHAR(20) NOT NULL DEFAULT 'manual',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (id, date),
        CONSTRAINT chk_verification_method CHECK (verification_method IN ('qr', 'manual', 'biometric', 'facial'))
      ) PARTITION BY RANGE (date);
    `);
    await queryRunner.query(`CREATE TABLE staff_attendance_default PARTITION OF staff_attendance DEFAULT;`);
    // Idempotency: a retried check-in for the same staff/flat/day must not
    // create a second row (CLAUDE.md non-negotiable — natural unique
    // constraint, same precedent as bills' UNIQUE(flat_id, billing_period)).
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_staff_attendance_natural_key ON staff_attendance(staff_id, flat_id, date);`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_staff_attendance_society_date ON staff_attendance(society_id, date DESC);`,
    );
    await queryRunner.query(`ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON staff_attendance
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE staff_leave_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        staff_id UUID NOT NULL REFERENCES domestic_staff(id),
        flat_id UUID NOT NULL REFERENCES flats(id),
        date_from DATE NOT NULL,
        date_to DATE NOT NULL,
        reason TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_leave_dates CHECK (date_to >= date_from),
        CONSTRAINT chk_leave_status CHECK (status IN ('pending', 'approved', 'rejected'))
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_staff_leave_requests_society ON staff_leave_requests(society_id, status);`,
    );
    await queryRunner.query(`ALTER TABLE staff_leave_requests ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON staff_leave_requests
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE staff_salary_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        staff_flat_mapping_id UUID NOT NULL REFERENCES staff_flat_mapping(id),
        month DATE NOT NULL,
        amount_due NUMERIC(12,2) NOT NULL CHECK (amount_due >= 0),
        amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (staff_flat_mapping_id, month)
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_staff_salary_records_society ON staff_salary_records(society_id);`,
    );
    await queryRunner.query(`ALTER TABLE staff_salary_records ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON staff_salary_records
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS staff_salary_records;`);
    await queryRunner.query(`DROP TABLE IF EXISTS staff_leave_requests;`);
    await queryRunner.query(`DROP TABLE IF EXISTS staff_attendance_default;`);
    await queryRunner.query(`DROP TABLE IF EXISTS staff_attendance;`);
    await queryRunner.query(`DROP TABLE IF EXISTS staff_flat_mapping;`);
    await queryRunner.query(`DROP TABLE IF EXISTS domestic_staff;`);
  }
}
