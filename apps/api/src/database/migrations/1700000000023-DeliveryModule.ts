import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SRS Module 6 tables.
 *
 * `delivery_agents` is a global directory keyed by phone — same shape and
 * same reasoning as `visitors`/`domestic_staff`: one courier/food-platform
 * agent recurs across many societies and many deliveries, no benefit to
 * duplicating their profile per-delivery. No RLS by design (see those
 * tables' own migration comments for the precedent).
 *
 * `deliveries` denormalizes `society_id` (not itemized in the SRS's own
 * `deliveries` column list, but required to keep the RLS convention direct
 * — same precedent as `guest_invites`/`resident`'s own denormalization).
 *
 * OTP storage is HASHED (`otp_hash` + `otp_expires_at` + `otp_attempts`),
 * matching `otp_requests`' shape from Module 1 — not the SRS's own DDL
 * sketch's plaintext `otp_code` column, and deliberately NOT a row in
 * `otp_requests` itself: a delivery-handover code and a login code are
 * different concerns (different lifetime, different failure/lockout
 * behavior, different table `used-by` semantics), sharing a table would
 * couple them for no real gain. One OTP per delivery record, not one per
 * flat, so simultaneous deliveries to the same flat can't cross-verify
 * each other's codes (§6's own stated edge case).
 *
 * RLS policy uses `NULLIF(current_setting(...), '')::UUID` from the start
 * — see migration 1700000000021's own comment for why a bare
 * `current_setting(...)::UUID` cast is a latent bug (an unset-via-
 * set_config(...,NULL,...) GUC is an empty string, not SQL NULL).
 */
export class DeliveryModule1700000000023 implements MigrationInterface {
  name = 'DeliveryModule1700000000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE delivery_agents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone VARCHAR(15),
        name VARCHAR(255),
        platform VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_delivery_agents_phone ON delivery_agents(phone) WHERE deleted_at IS NULL;`,
    );

    await queryRunner.query(`
      CREATE TABLE deliveries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        flat_id UUID NOT NULL REFERENCES flats(id),
        agent_id UUID NOT NULL REFERENCES delivery_agents(id),
        gate_id UUID NOT NULL REFERENCES gates(id),
        guard_id UUID NOT NULL REFERENCES guards(id),
        platform VARCHAR(50),
        parcel_photo_url TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        otp_hash CHAR(64) NOT NULL,
        otp_expires_at TIMESTAMPTZ NOT NULL,
        otp_attempts INT NOT NULL DEFAULT 0,
        otp_verified_at TIMESTAMPTZ,
        held_at_desk BOOLEAN NOT NULL DEFAULT false,
        handover_override_reason TEXT,
        idempotency_key UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT chk_delivery_status CHECK (status IN ('pending', 'handed_over', 'returned')),
        CONSTRAINT chk_delivery_otp_attempts CHECK (otp_attempts >= 0)
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_deliveries_flat_status ON deliveries(flat_id, status) WHERE deleted_at IS NULL;`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_deliveries_society ON deliveries(society_id) WHERE deleted_at IS NULL;`,
    );
    // Partial + nullable, same idempotency-key convention as
    // amenity_bookings — omitted on a live (non-offline-queued) creation,
    // present only when a guard kiosk replays a queued write after
    // reconnecting.
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_deliveries_idempotency_key ON deliveries(idempotency_key) WHERE idempotency_key IS NOT NULL;`,
    );

    await queryRunner.query(`ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON deliveries
        USING (society_id = NULLIF(current_setting('app.current_society_id', true), '')::UUID);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS deliveries;`);
    await queryRunner.query(`DROP TABLE IF EXISTS delivery_agents;`);
  }
}
