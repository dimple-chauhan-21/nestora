import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SRS Module 8 tables. Not in §10.4's partitioning list (unlike
 * visitor_visits/gate_logs/staff_attendance) despite §10.2's ~30M/year
 * growth estimate — the SRS's own partitioning list is the authority here,
 * so these stay plain RLS tables, no composite PK/partition machinery.
 *
 * `complaint_categories.society_id` is nullable per §6's own column note
 * ("nullable for global defaults") — RLS is widened with `OR society_id IS
 * NULL` so every society can see the global defaults alongside their own
 * overrides, without needing a separate bypass role.
 *
 * `complaints.society_id` is denormalized (not in §6's own column list for
 * this table) — same precedent as guest_invites/ledger_entries: RLS's
 * tenant_isolation policy needs it directly rather than joining through
 * flat_id every time.
 *
 * `complaint_escalations` gets `UNIQUE(complaint_id)` — this session's
 * addition beyond §6's column list. It's what makes the SLA-breach sweep
 * idempotent (a complaint escalates once; re-sweeping checks for existing
 * rows) and guards against a double-insert if the cron sweep and a
 * read-triggered sweep race on the same overdue complaint.
 */
export class ComplaintModule1700000000012 implements MigrationInterface {
  name = 'ComplaintModule1700000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE complaint_categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID REFERENCES societies(id),
        name VARCHAR(100) NOT NULL,
        default_sla_hours INT NOT NULL CHECK (default_sla_hours > 0),
        default_assignee_role VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_complaint_categories_society ON complaint_categories(society_id) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(`ALTER TABLE complaint_categories ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON complaint_categories
        USING (society_id = current_setting('app.current_society_id', true)::UUID OR society_id IS NULL);
    `);

    await queryRunner.query(`
      CREATE TABLE complaints (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        flat_id UUID NOT NULL REFERENCES flats(id),
        raised_by UUID NOT NULL REFERENCES users(id),
        category_id UUID NOT NULL REFERENCES complaint_categories(id),
        priority VARCHAR(10) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        assigned_to UUID REFERENCES users(id),
        sla_due_at TIMESTAMPTZ NOT NULL,
        resolved_at TIMESTAMPTZ,
        satisfaction_rating INT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_complaint_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        CONSTRAINT chk_complaint_status CHECK (
          status IN ('open', 'assigned', 'in_progress', 'resolved', 'reopened', 'closed')
        ),
        CONSTRAINT chk_satisfaction_rating CHECK (satisfaction_rating IS NULL OR satisfaction_rating BETWEEN 1 AND 5)
      );
    `);
    await queryRunner.query(`CREATE INDEX idx_complaints_society_status ON complaints(society_id, status);`);
    await queryRunner.query(`CREATE INDEX idx_complaints_flat ON complaints(flat_id);`);
    // Drives the SLA-breach sweep query directly — only overdue, still-open complaints.
    await queryRunner.query(`
      CREATE INDEX idx_complaints_sla_due ON complaints(sla_due_at)
        WHERE status IN ('open', 'assigned', 'in_progress');
    `);
    await queryRunner.query(`ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON complaints
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE complaint_attachments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        complaint_id UUID NOT NULL REFERENCES complaints(id),
        file_url TEXT NOT NULL,
        type VARCHAR(10) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_attachment_type CHECK (type IN ('image', 'video'))
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_complaint_attachments_complaint ON complaint_attachments(complaint_id);`,
    );
    await queryRunner.query(`ALTER TABLE complaint_attachments ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON complaint_attachments
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE complaint_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        complaint_id UUID NOT NULL REFERENCES complaints(id),
        author_id UUID NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,
        is_internal BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_complaint_comments_complaint ON complaint_comments(complaint_id, created_at);`,
    );
    await queryRunner.query(`ALTER TABLE complaint_comments ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON complaint_comments
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE complaint_escalations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        complaint_id UUID NOT NULL REFERENCES complaints(id) UNIQUE,
        escalated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        escalated_to UUID REFERENCES users(id),
        reason TEXT NOT NULL
      );
    `);
    await queryRunner.query(`ALTER TABLE complaint_escalations ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON complaint_escalations
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS complaint_escalations;`);
    await queryRunner.query(`DROP TABLE IF EXISTS complaint_comments;`);
    await queryRunner.query(`DROP TABLE IF EXISTS complaint_attachments;`);
    await queryRunner.query(`DROP TABLE IF EXISTS complaints;`);
    await queryRunner.query(`DROP TABLE IF EXISTS complaint_categories;`);
  }
}
