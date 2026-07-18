import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Escalation tracking for the approval-timeout workflow (§4 User Flow).
 * Kept as a separate nullable column rather than adding an 'escalated'
 * value to visitor_visits.status's CHECK constraint — a visit stays
 * meaningfully "pending" (still awaiting a decision) whether or not it's
 * been escalated; escalated_at is a marker so the sweep doesn't re-notify
 * the same visit every time it runs, not a distinct lifecycle state.
 */
export class VisitorVisitEscalation1700000000008 implements MigrationInterface {
  name = 'VisitorVisitEscalation1700000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE visitor_visits ADD COLUMN escalated_at TIMESTAMPTZ;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE visitor_visits DROP COLUMN IF EXISTS escalated_at;`);
  }
}
