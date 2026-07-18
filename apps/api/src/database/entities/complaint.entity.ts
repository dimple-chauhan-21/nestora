import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type ComplaintPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ComplaintStatus = 'open' | 'assigned' | 'in_progress' | 'resolved' | 'reopened' | 'closed';

@Entity('complaints')
export class Complaint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'flat_id' })
  flatId!: string;

  @Column({ type: 'uuid', name: 'raised_by' })
  raisedBy!: string;

  @Column({ type: 'uuid', name: 'category_id' })
  categoryId!: string;

  @Column({ type: 'varchar', length: 10 })
  priority!: ComplaintPriority;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status!: ComplaintStatus;

  @Column({ type: 'uuid', name: 'assigned_to', nullable: true })
  assignedTo!: string | null;

  @Column({ type: 'timestamptz', name: 'sla_due_at' })
  slaDueAt!: Date;

  @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'int', name: 'satisfaction_rating', nullable: true })
  satisfactionRating!: number | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
