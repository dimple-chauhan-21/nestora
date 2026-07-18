import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SRS Module 22's `audit_logs` — exact §10.3 DDL (partitioned by occurred_at,
 * composite PK). `api_request_logs` is explicitly out of scope per §22's own
 * edge-case note: it's meant to ship to the ELK stack, not live in the
 * primary OLTP DB — not built this session.
 *
 * The insert-only REVOKE is executed for real here (not just documented) —
 * deliverable #1 asked for it explicitly. It's currently a structural no-op
 * against the dev/CI connection (table-owning role bypasses grants
 * entirely, same as every other REVOKE in this codebase — login_audit,
 * ledger_entries) — tracked in KNOWN_GAPS.md, not silently forgotten.
 */
export class AuditModule1700000000010 implements MigrationInterface {
  name = 'AuditModule1700000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        society_id UUID REFERENCES societies(id),
        actor_id UUID REFERENCES users(id),
        action VARCHAR(50) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id UUID,
        before_state JSONB,
        after_state JSONB,
        ip INET,
        user_agent TEXT,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (id, occurred_at)
      ) PARTITION BY RANGE (occurred_at);
    `);
    await queryRunner.query(`CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;`);
    await queryRunner.query(
      `CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id, occurred_at DESC);`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_audit_logs_society ON audit_logs(society_id, occurred_at DESC);`,
    );

    // Same nullable-society_id bypass pattern as user_roles (platform-level
    // audit events, e.g. company/society creation, have no society_id).
    await queryRunner.query(`ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON audit_logs
        USING (
          society_id = current_setting('app.current_society_id', true)::UUID
          OR (society_id IS NULL AND current_setting('app.is_platform_scope', true) = 'true')
        );
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write_role') THEN
          REVOKE UPDATE, DELETE ON audit_logs FROM app_write_role;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs_default;`);
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs;`);
  }
}
