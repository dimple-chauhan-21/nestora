import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('residents')
export class Resident {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'flat_id' })
  flatId!: string;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 20, name: 'relation_type' })
  relationType!: 'owner' | 'tenant' | 'family';

  @Column({ type: 'boolean', name: 'is_senior_citizen', default: false })
  isSeniorCitizen!: boolean;

  @Column({ type: 'boolean', name: 'is_child', default: false })
  isChild!: boolean;

  @Column({ type: 'date', name: 'move_in_date', nullable: true })
  moveInDate!: string | null;

  @Column({ type: 'date', name: 'move_out_date', nullable: true })
  moveOutDate!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: 'active' | 'suspended' | 'moved_out';

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
