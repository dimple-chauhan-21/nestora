import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('guest_invites')
export class GuestInvite {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'flat_id' })
  flatId!: string;

  @Column({ type: 'uuid', name: 'created_by_resident_id' })
  createdByResidentId!: string;

  @Column({ type: 'varchar', length: 255, name: 'guest_name' })
  guestName!: string;

  @Column({ type: 'varchar', length: 15, name: 'guest_phone', nullable: true })
  guestPhone!: string | null;

  @Column({ type: 'timestamptz', name: 'valid_from' })
  validFrom!: Date;

  @Column({ type: 'timestamptz', name: 'valid_to' })
  validTo!: Date;

  @Column({ type: 'text', name: 'recurrence_rule', nullable: true })
  recurrenceRule!: string | null;

  @Column({ type: 'text', name: 'qr_token', unique: true })
  qrToken!: string;

  @Column({ type: 'timestamptz', name: 'consumed_at', nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
