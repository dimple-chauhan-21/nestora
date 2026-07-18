import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('society_settings')
export class SocietySettings {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'int', name: 'billing_cycle_day', default: 1 })
  billingCycleDay!: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, name: 'late_fee_pct', default: 0 })
  lateFeePct!: string;

  @Column({ type: 'int', name: 'fiscal_year_start_month', default: 4 })
  fiscalYearStartMonth!: number;

  @Column({ type: 'jsonb', name: 'feature_flags', default: {} })
  featureFlags!: Record<string, unknown>;

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
