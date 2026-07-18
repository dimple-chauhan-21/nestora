import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('billing_plans')
export class BillingPlan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'varchar', length: 20, name: 'formula_type' })
  formulaType!: 'flat_rate' | 'per_sqft' | 'per_head';

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  rate!: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, name: 'late_fee_pct', default: 0 })
  lateFeePct!: string;

  @Column({ type: 'int', name: 'grace_period_days', default: 0 })
  gracePeriodDays!: number;

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
