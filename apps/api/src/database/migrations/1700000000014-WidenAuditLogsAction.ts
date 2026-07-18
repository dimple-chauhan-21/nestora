import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `audit_logs.action` was VARCHAR(50) — three domestic-staff police-
 * verification action strings exceeded it this session
 * (`domestic_staff.police_verification_document_uploaded`, 52 chars),
 * caught only by an integration test hitting a raw Postgres error. Widened
 * to VARCHAR(100) for real headroom, paired with `AuditAction` (see
 * `audit-actions.ts`) so a too-long or unregistered action code is now a
 * compile error instead. `audit_logs` is partitioned by RANGE(occurred_at);
 * a compatible column-width change on the parent table applies to every
 * partition (including future ones) without touching them individually.
 */
export class WidenAuditLogsAction1700000000014 implements MigrationInterface {
  name = 'WidenAuditLogsAction1700000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE audit_logs ALTER COLUMN action TYPE VARCHAR(100);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE audit_logs ALTER COLUMN action TYPE VARCHAR(50);`);
  }
}
