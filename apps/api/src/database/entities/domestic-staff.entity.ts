import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type StaffType = 'maid' | 'driver' | 'cook' | 'cleaner' | 'caretaker';
export type PoliceVerificationStatus = 'pending' | 'verified' | 'rejected';

/** Global directory, not society-scoped — same shape as Visitor. */
@Entity('domestic_staff')
export class DomesticStaff {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 15 })
  phone!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', name: 'photo_url', nullable: true })
  photoUrl!: string | null;

  @Column({ type: 'varchar', length: 20, name: 'staff_type' })
  staffType!: StaffType;

  @Column({ type: 'text', name: 'police_verification_doc_url', nullable: true })
  policeVerificationDocUrl!: string | null;

  @Column({ type: 'varchar', length: 20, name: 'police_verification_status', default: 'pending' })
  policeVerificationStatus!: PoliceVerificationStatus;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
