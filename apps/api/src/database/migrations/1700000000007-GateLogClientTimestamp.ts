import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `gate_logs.occurred_at` stays server-assigned (authoritative), but the
 * offline-sync design (session #9) needs the kiosk's own locally-recorded
 * timestamp preserved too — a kiosk offline for 45 minutes and replaying 5
 * queued check-ins shouldn't have them all land within the same second of
 * `occurred_at`. Nullable: only populated for gate_logs rows written via
 * offline sync; a live (online) gate/scan write has no "client reported"
 * value distinct from the server's own clock.
 */
export class GateLogClientTimestamp1700000000007 implements MigrationInterface {
  name = 'GateLogClientTimestamp1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE gate_logs ADD COLUMN occurred_at_client_reported TIMESTAMPTZ;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE gate_logs DROP COLUMN IF EXISTS occurred_at_client_reported;`);
  }
}
