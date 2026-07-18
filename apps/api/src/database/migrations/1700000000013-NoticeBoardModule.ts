import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SRS Module 11 tables.
 *
 * `notices.resolved_recipient_user_ids` is this session's addition beyond
 * §6's own column list — same precedent as ledger_entries.reverses_entry_id:
 * the SRS's own edge-case text ("notice targeted at a tower that's later
 * deleted... audience snapshot at publish time preserved for historical
 * read-reports") demands behavior the base column list doesn't literally
 * spell out, so the column encoding it is added directly. `target_audience`
 * (jsonb: all/tower_ids/role) stays as the human-authored *rule*;
 * `resolved_recipient_user_ids` is the *resolved snapshot* taken once, at
 * creation — deliverable #7's "resolve at publish time, not re-resolved on
 * every read."
 *
 * No separate draft/publish workflow or edit-history table this session
 * (§11's Security note mentions both, but neither is in this session's
 * explicit deliverable list) — `POST /notices` creates an already-published
 * notice directly; `published_at` is set at creation. Kept as a real column
 * rather than derived so a draft workflow can be added later without a
 * schema change, but the workflow itself isn't built now.
 */
export class NoticeBoardModule1700000000013 implements MigrationInterface {
  name = 'NoticeBoardModule1700000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE notices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        category VARCHAR(50),
        target_audience JSONB NOT NULL,
        resolved_recipient_user_ids JSONB NOT NULL DEFAULT '[]',
        is_pinned BOOLEAN NOT NULL DEFAULT false,
        expires_at TIMESTAMPTZ,
        published_by UUID REFERENCES users(id),
        published_at TIMESTAMPTZ,
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_notices_society ON notices(society_id) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_notices_society_pinned ON notices(society_id, is_pinned) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(`ALTER TABLE notices ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON notices
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE notice_attachments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        notice_id UUID NOT NULL REFERENCES notices(id),
        file_url TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX idx_notice_attachments_notice ON notice_attachments(notice_id);`);
    await queryRunner.query(`ALTER TABLE notice_attachments ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON notice_attachments
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE notice_reads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        notice_id UUID NOT NULL REFERENCES notices(id),
        user_id UUID NOT NULL REFERENCES users(id),
        read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (notice_id, user_id)
      );
    `);
    await queryRunner.query(`CREATE INDEX idx_notice_reads_notice ON notice_reads(notice_id);`);
    await queryRunner.query(`ALTER TABLE notice_reads ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON notice_reads
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notice_reads;`);
    await queryRunner.query(`DROP TABLE IF EXISTS notice_attachments;`);
    await queryRunner.query(`DROP TABLE IF EXISTS notices;`);
  }
}
