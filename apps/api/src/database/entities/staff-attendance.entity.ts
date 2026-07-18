import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type VerificationMethod = 'qr' | 'manual' | 'biometric' | 'facial';

/** Partitioned by RANGE(date) at the DB level — see migration comment. */
@Entity('staff_attendance')
export class StaffAttendance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'staff_id' })
  staffId!: string;

  @Column({ type: 'uuid', name: 'flat_id' })
  flatId!: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'timestamptz', name: 'check_in_time', nullable: true })
  checkInTime!: Date | null;

  @Column({ type: 'timestamptz', name: 'check_out_time', nullable: true })
  checkOutTime!: Date | null;

  @Column({ type: 'varchar', length: 20, name: 'verification_method', default: 'manual' })
  verificationMethod!: VerificationMethod;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
