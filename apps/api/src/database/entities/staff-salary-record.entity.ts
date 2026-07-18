import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('staff_salary_records')
export class StaffSalaryRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'staff_flat_mapping_id' })
  staffFlatMappingId!: string;

  @Column({ type: 'date' })
  month!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'amount_due' })
  amountDue!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'amount_paid', default: 0 })
  amountPaid!: string;

  @Column({ type: 'timestamptz', name: 'paid_at', nullable: true })
  paidAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
