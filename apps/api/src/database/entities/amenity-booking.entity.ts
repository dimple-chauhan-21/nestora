import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type AmenityBookingStatus = 'confirmed' | 'cancelled' | 'completed';

/**
 * `slot` (TSTZRANGE) is declared here for schema/typing completeness, but
 * AmenityBookingService reads/writes this table via raw parameterized SQL
 * (`DataSource.query()`), not the repository's typed `create()`/`save()` —
 * TypeORM has no native mapping from two JS `Date`s to a Postgres range
 * literal, and the exclusion-constraint error handling needs the raw
 * driver error's `.code`/`.constraint` fields anyway, which raw `.query()`
 * preserves most directly.
 */
@Entity('amenity_bookings')
export class AmenityBooking {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'amenity_id' })
  amenityId!: string;

  @Column({ type: 'uuid', name: 'flat_id' })
  flatId!: string;

  @Column({ type: 'uuid', name: 'booked_by' })
  bookedBy!: string;

  @Column({ type: 'tstzrange' })
  slot!: string;

  @Column({ type: 'varchar', length: 20, default: 'confirmed' })
  status!: AmenityBookingStatus;

  @Column({ type: 'uuid', name: 'payment_id', nullable: true })
  paymentId!: string | null;

  @Column({ type: 'uuid', name: 'idempotency_key' })
  idempotencyKey!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
