import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** `societyId` null = global default category, visible to every society (see migration's RLS policy). */
@Entity('complaint_categories')
export class ComplaintCategory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id', nullable: true })
  societyId!: string | null;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'int', name: 'default_sla_hours' })
  defaultSlaHours!: number;

  @Column({ type: 'varchar', length: 50, name: 'default_assignee_role', nullable: true })
  defaultAssigneeRole!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
