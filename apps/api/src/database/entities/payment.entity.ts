import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type PaymentMethod = 'online' | 'cash' | 'cheque' | 'bank_transfer';
export type PaymentStatus = 'pending' | 'success' | 'failed' | 'refunded';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'bill_id' })
  billId!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: 'char', length: 3, default: 'INR' })
  currency!: string;

  @Column({ type: 'varchar', length: 20 })
  method!: PaymentMethod;

  @Column({ type: 'varchar', length: 100, name: 'gateway_ref', unique: true, nullable: true })
  gatewayRef!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: PaymentStatus;

  /** Offline (cash/cheque) payments only — distinct from the webhook-confirmed online path. */
  @Column({ type: 'boolean', default: false })
  reconciled!: boolean;

  @Column({ type: 'timestamptz', name: 'paid_at', nullable: true })
  paidAt!: Date | null;

  /** Null for self-service online payments — set for Accountant-recorded offline payments. */
  @Column({ type: 'uuid', name: 'recorded_by', nullable: true })
  recordedBy!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
