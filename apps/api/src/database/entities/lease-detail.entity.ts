import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('lease_details')
export class LeaseDetail {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'resident_id' })
  residentId!: string;

  @Column({ type: 'date', name: 'lease_start' })
  leaseStart!: string;

  @Column({ type: 'date', name: 'lease_end' })
  leaseEnd!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'monthly_rent', nullable: true })
  monthlyRent!: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'deposit_amount', nullable: true })
  depositAmount!: string | null;

  @Column({ type: 'char', length: 3, default: 'INR' })
  currency!: string;

  @Column({ type: 'uuid', name: 'agreement_doc_id', nullable: true })
  agreementDocId!: string | null;

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
