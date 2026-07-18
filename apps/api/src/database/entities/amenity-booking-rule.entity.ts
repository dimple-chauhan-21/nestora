import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('amenity_booking_rules')
export class AmenityBookingRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'amenity_id' })
  amenityId!: string;

  @Column({ type: 'int', name: 'min_duration_mins' })
  minDurationMins!: number;

  @Column({ type: 'int', name: 'max_duration_mins' })
  maxDurationMins!: number;

  @Column({ type: 'int', name: 'advance_booking_days', default: 7 })
  advanceBookingDays!: number;

  @Column({ type: 'int', name: 'cancellation_window_hours', default: 24 })
  cancellationWindowHours!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'fee_amount', default: 0 })
  feeAmount!: string;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy!: string | null;

  @Column({ type: 'uuid', name: 'updated_by', nullable: true })
  updatedBy!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
