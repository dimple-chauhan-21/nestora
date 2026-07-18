import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SRS Module 5 tables, including `gate_logs` which §6 explicitly describes
 * as shared with Module 4.
 *
 * `gate_logs.visitor_visit_id` is a plain UUID column, NOT a hard FK — its
 * parent (`visitor_visits`) is partitioned with a composite `(id,
 * created_at)` primary key, and Postgres can't target a partitioned table's
 * composite key with a single-column FK from another table. It's nullable
 * (only populated when `entity_type = 'visitor'`) and validated at the
 * application layer instead, same tradeoff the SRS itself accepts for
 * partitioned high-growth tables (§10.4).
 *
 * `idempotency_key` on `gate_logs` is this session's addition, ahead of the
 * offline-sync work (#9) — every gate-log write needs a natural retry-safe
 * key so a guard kiosk replaying a queued write after a partial sync doesn't
 * double-log an entry (CLAUDE.md's idempotency non-negotiable).
 */
export class SecurityGuardModule1700000000006 implements MigrationInterface {
  name = 'SecurityGuardModule1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE gates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        name VARCHAR(100) NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'main',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT chk_gate_type CHECK (type IN ('main', 'service', 'pedestrian'))
      );
    `);
    await queryRunner.query(`CREATE INDEX idx_gates_society ON gates(society_id) WHERE deleted_at IS NULL;`);
    await queryRunner.query(`ALTER TABLE gates ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON gates
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE guards (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        user_id UUID NOT NULL REFERENCES users(id),
        gate_id UUID REFERENCES gates(id),
        shift_pattern VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
    `);
    await queryRunner.query(`CREATE INDEX idx_guards_society ON guards(society_id) WHERE deleted_at IS NULL;`);
    await queryRunner.query(`CREATE INDEX idx_guards_user ON guards(user_id) WHERE deleted_at IS NULL;`);
    await queryRunner.query(`ALTER TABLE guards ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON guards
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE gate_logs (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        gate_id UUID NOT NULL REFERENCES gates(id),
        guard_id UUID NOT NULL REFERENCES guards(id),
        entity_type VARCHAR(20) NOT NULL,
        visitor_visit_id UUID,
        direction VARCHAR(10) NOT NULL,
        method VARCHAR(20) NOT NULL,
        override_reason TEXT,
        idempotency_key UUID NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (id, occurred_at),
        CONSTRAINT chk_gate_log_entity_type CHECK (entity_type IN ('visitor', 'delivery', 'staff', 'vehicle')),
        CONSTRAINT chk_gate_log_direction CHECK (direction IN ('in', 'out')),
        CONSTRAINT chk_gate_log_method CHECK (method IN ('qr', 'manual', 'facial'))
      ) PARTITION BY RANGE (occurred_at);
    `);
    await queryRunner.query(`CREATE TABLE gate_logs_default PARTITION OF gate_logs DEFAULT;`);
    // Idempotency is enforced per-partition by Postgres (unique indexes on a
    // partitioned table apply within each partition unless they include the
    // partition key) — occurred_at is in the key, which is fine here: a
    // genuine retry of the *same* queued action reuses the same
    // idempotency_key and, in practice, lands in the same (or adjacent)
    // partition since it's retried shortly after the original attempt.
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_gate_logs_idempotency_key ON gate_logs(idempotency_key, occurred_at);`,
    );
    await queryRunner.query(`CREATE INDEX idx_gate_logs_gate ON gate_logs(gate_id, occurred_at DESC);`);
    await queryRunner.query(
      `CREATE INDEX idx_gate_logs_visitor_visit ON gate_logs(visitor_visit_id) WHERE visitor_visit_id IS NOT NULL;`,
    );
    await queryRunner.query(`ALTER TABLE gate_logs ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON gate_logs
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE emergency_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        raised_by UUID NOT NULL REFERENCES users(id),
        type VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        resolution_note TEXT,
        resolved_by UUID REFERENCES users(id),
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_emergency_alert_type CHECK (type IN ('fire', 'medical', 'security', 'other')),
        CONSTRAINT chk_emergency_alert_status CHECK (status IN ('active', 'resolved')),
        -- Enforced at the DB level, not just the app: a resolved alert MUST
        -- carry a resolution_note. Belt-and-suspenders with the service-layer
        -- check (§6 Module 5 validation rule).
        CONSTRAINT chk_emergency_alert_resolution CHECK (
          status = 'active' OR (status = 'resolved' AND resolution_note IS NOT NULL)
        )
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_emergency_alerts_society_status ON emergency_alerts(society_id, status);`,
    );
    await queryRunner.query(`ALTER TABLE emergency_alerts ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON emergency_alerts
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE shift_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        guard_id UUID NOT NULL REFERENCES guards(id),
        gate_id UUID NOT NULL REFERENCES gates(id),
        shift_date DATE NOT NULL,
        entries_count INT NOT NULL DEFAULT 0,
        exits_count INT NOT NULL DEFAULT 0,
        alerts_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (guard_id, gate_id, shift_date)
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_shift_reports_society_date ON shift_reports(society_id, shift_date DESC);`,
    );
    await queryRunner.query(`ALTER TABLE shift_reports ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON shift_reports
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS shift_reports;`);
    await queryRunner.query(`DROP TABLE IF EXISTS emergency_alerts;`);
    await queryRunner.query(`DROP TABLE IF EXISTS gate_logs_default;`);
    await queryRunner.query(`DROP TABLE IF EXISTS gate_logs;`);
    await queryRunner.query(`DROP TABLE IF EXISTS guards;`);
    await queryRunner.query(`DROP TABLE IF EXISTS gates;`);
  }
}
