import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('staff_flat_mapping')
export class StaffFlatMapping {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'staff_id' })
  staffId!: string;

  @Column({ type: 'uuid', name: 'flat_id' })
  flatId!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'monthly_salary', nullable: true })
  monthlySalary!: string | null;

  @Column({ type: 'jsonb', name: 'work_days', nullable: true })
  workDays!: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

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
