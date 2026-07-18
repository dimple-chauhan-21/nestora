import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SRS Module 10 tables.
 *
 * `parking_slots.status` includes `blocked` beyond §6's terse "allocated/
 * vacant/reserved" column note — §6's own Edge Cases text spells it out
 * ("slot under maintenance, temporarily status=blocked, excluded from
 * allocation"), so the value the prose describes is added to the enum.
 *
 * `parking_slots.is_visitor_pool` is this session's addition beyond §6's
 * column list — the Edge Cases text says "visitor parking is a shared
 * pool" but never says which slots belong to it. Without a marker, gate
 * check-in could accidentally hand out a resident's own allocated slot to
 * a visitor. Same precedent as ledger_entries.reverses_entry_id: the SRS's
 * own prose demands behavior the base column list doesn't spell out.
 *
 * `parking_allocations`: "one active allocation per slot at a time" (§6
 * Validations) is enforced via a partial unique index on currently-active
 * rows, not just an app-layer check — same shape as staff_flat_mapping's
 * active-mapping constraint.
 *
 * `visitor_parking_log.visitor_visit_id` is a plain UUID, not a hard FK —
 * same precedent as gate_logs.visitor_visit_id (visitor_visits is
 * partitioned with a composite (id, created_at) PK, so nothing downstream
 * takes a hard FK reference to it).
 */
export class ParkingModule1700000000015 implements MigrationInterface {
  name = 'ParkingModule1700000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE parking_slots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        slot_number VARCHAR(20) NOT NULL,
        zone VARCHAR(50),
        type VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'vacant',
        is_visitor_pool BOOLEAN NOT NULL DEFAULT false,
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        UNIQUE (society_id, slot_number),
        CONSTRAINT chk_parking_slot_type CHECK (type IN ('covered', 'open', '2-wheeler', '4-wheeler')),
        CONSTRAINT chk_parking_slot_status CHECK (status IN ('allocated', 'vacant', 'reserved', 'blocked'))
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_parking_slots_society ON parking_slots(society_id) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_parking_slots_visitor_pool ON parking_slots(society_id, status) WHERE is_visitor_pool = true;`,
    );
    await queryRunner.query(`ALTER TABLE parking_slots ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON parking_slots
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE parking_allocations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        slot_id UUID NOT NULL REFERENCES parking_slots(id),
        flat_id UUID NOT NULL REFERENCES flats(id),
        vehicle_id UUID REFERENCES vehicles(id),
        allocated_from DATE NOT NULL,
        allocated_to DATE,
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT chk_parking_allocation_dates CHECK (allocated_to IS NULL OR allocated_to >= allocated_from)
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_parking_allocations_active_slot ON parking_allocations(slot_id)
        WHERE deleted_at IS NULL AND allocated_to IS NULL;
    `);
    await queryRunner.query(
      `CREATE INDEX idx_parking_allocations_flat ON parking_allocations(flat_id) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(`ALTER TABLE parking_allocations ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON parking_allocations
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE visitor_parking_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        slot_id UUID NOT NULL REFERENCES parking_slots(id),
        visitor_visit_id UUID NOT NULL,
        checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        checked_out_at TIMESTAMPTZ
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_visitor_parking_log_visit ON visitor_parking_log(visitor_visit_id);`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_visitor_parking_log_open ON visitor_parking_log(slot_id) WHERE checked_out_at IS NULL;`,
    );
    await queryRunner.query(`ALTER TABLE visitor_parking_log ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON visitor_parking_log
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE parking_violations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        slot_id UUID REFERENCES parking_slots(id),
        reported_by UUID NOT NULL REFERENCES users(id),
        photo_url TEXT NOT NULL,
        description TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_parking_violation_status CHECK (status IN ('open', 'resolved', 'dismissed'))
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_parking_violations_society_status ON parking_violations(society_id, status);`,
    );
    await queryRunner.query(`ALTER TABLE parking_violations ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON parking_violations
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS parking_violations;`);
    await queryRunner.query(`DROP TABLE IF EXISTS visitor_parking_log;`);
    await queryRunner.query(`DROP TABLE IF EXISTS parking_allocations;`);
    await queryRunner.query(`DROP TABLE IF EXISTS parking_slots;`);
  }
}
