import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SRS Module 16 tables. `amenity_bookings` uses §10.3's exact representative
 * DDL — `slot TSTZRANGE` + `EXCLUDE USING gist (amenity_id WITH =, slot
 * WITH &&) WHERE (status = 'confirmed')`, not the simplified `start_at`/
 * `end_at` pair from §6's own column list — the task explicitly calls for
 * the §10.3 pattern verbatim, and the exclusion constraint needs a single
 * range column to operate on. `btree_gist` is required for the `=`
 * operator class on `amenity_id` (a uuid) to participate in a GiST
 * exclusion constraint alongside the range overlap operator.
 *
 * Both the idempotency-key UNIQUE constraint and the EXCLUDE constraint are
 * given explicit names (`uq_amenity_bookings_idempotency_key`,
 * `excl_amenity_bookings_overlap`) specifically so the service layer can
 * distinguish "idempotent retry" (23505 on the named UNIQUE constraint —
 * replay the original booking) from "lost the double-booking race" (23P01,
 * a completely different SQLSTATE for exclusion violations) from any other
 * unexpected DB error (rethrown as-is) — see AmenityBookingService.
 *
 * `payment_id` is nullable per §6's own column list (paid amenities route
 * through Module 9) — not wired to a real payment flow this session, kept
 * as an open seam only, same "column exists, workflow isn't built yet"
 * precedent as staff_salary_records.
 */
export class AmenityBookingModule1700000000016 implements MigrationInterface {
  name = 'AmenityBookingModule1700000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist;`);

    await queryRunner.query(`
      CREATE TABLE amenity_booking_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        amenity_id UUID NOT NULL REFERENCES amenities_master(id),
        min_duration_mins INT NOT NULL CHECK (min_duration_mins > 0),
        max_duration_mins INT NOT NULL CHECK (max_duration_mins >= min_duration_mins),
        advance_booking_days INT NOT NULL DEFAULT 7 CHECK (advance_booking_days >= 0),
        cancellation_window_hours INT NOT NULL DEFAULT 24 CHECK (cancellation_window_hours >= 0),
        fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_amenity_booking_rules_amenity ON amenity_booking_rules(amenity_id)
        WHERE deleted_at IS NULL;
    `);
    await queryRunner.query(`ALTER TABLE amenity_booking_rules ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON amenity_booking_rules
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);

    await queryRunner.query(`
      CREATE TABLE amenity_bookings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID NOT NULL REFERENCES societies(id),
        amenity_id UUID NOT NULL REFERENCES amenities_master(id),
        flat_id UUID NOT NULL REFERENCES flats(id),
        booked_by UUID NOT NULL REFERENCES users(id),
        slot TSTZRANGE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
        payment_id UUID REFERENCES payments(id),
        idempotency_key UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_amenity_bookings_idempotency_key UNIQUE (idempotency_key),
        CONSTRAINT chk_amenity_booking_status CHECK (status IN ('confirmed', 'cancelled', 'completed')),
        CONSTRAINT excl_amenity_bookings_overlap
          EXCLUDE USING gist (amenity_id WITH =, slot WITH &&) WHERE (status = 'confirmed')
      );
    `);
    await queryRunner.query(`CREATE INDEX idx_amenity_bookings_society ON amenity_bookings(society_id);`);
    await queryRunner.query(`CREATE INDEX idx_amenity_bookings_flat ON amenity_bookings(flat_id);`);
    await queryRunner.query(`ALTER TABLE amenity_bookings ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON amenity_bookings
        USING (society_id = current_setting('app.current_society_id', true)::UUID);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS amenity_bookings;`);
    await queryRunner.query(`DROP TABLE IF EXISTS amenity_booking_rules;`);
  }
}
