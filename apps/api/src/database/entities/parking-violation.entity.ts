import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type ParkingViolationStatus = 'open' | 'resolved' | 'dismissed';

@Entity('parking_violations')
export class ParkingViolation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'slot_id', nullable: true })
  slotId!: string | null;

  @Column({ type: 'uuid', name: 'reported_by' })
  reportedBy!: string;

  @Column({ type: 'text', name: 'photo_url' })
  photoUrl!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status!: ParkingViolationStatus;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
