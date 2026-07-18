import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected';

@Entity('staff_leave_requests')
export class StaffLeaveRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'staff_id' })
  staffId!: string;

  @Column({ type: 'uuid', name: 'flat_id' })
  flatId!: string;

  @Column({ type: 'date', name: 'date_from' })
  dateFrom!: string;

  @Column({ type: 'date', name: 'date_to' })
  dateTo!: string;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: LeaveRequestStatus;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
