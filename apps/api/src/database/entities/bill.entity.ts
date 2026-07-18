import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type BillStatus = 'unpaid' | 'partial' | 'paid' | 'overdue';

@Entity('bills')
export class Bill {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'flat_id' })
  flatId!: string;

  @Column({ type: 'date', name: 'billing_period' })
  billingPeriod!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'amount_due' })
  amountDue!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'amount_paid', default: 0 })
  amountPaid!: string;

  @Column({ type: 'char', length: 3, default: 'INR' })
  currency!: string;

  @Column({ type: 'date', name: 'due_date' })
  dueDate!: string;

  @Column({ type: 'varchar', length: 20, default: 'unpaid' })
  status!: BillStatus;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'late_fee_applied', default: 0 })
  lateFeeApplied!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
