import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user_roles')
export class UserRole {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'uuid', name: 'role_id' })
  roleId!: string;

  @Column({ type: 'uuid', name: 'society_id', nullable: true })
  societyId!: string | null;

  @Column({ type: 'uuid', name: 'flat_id', nullable: true })
  flatId!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
