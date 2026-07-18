import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('emergency_alerts')
export class EmergencyAlert {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'raised_by' })
  raisedBy!: string;

  @Column({ type: 'varchar', length: 20 })
  type!: 'fire' | 'medical' | 'security' | 'other';

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: 'active' | 'resolved';

  @Column({ type: 'text', name: 'resolution_note', nullable: true })
  resolutionNote!: string | null;

  @Column({ type: 'uuid', name: 'resolved_by', nullable: true })
  resolvedBy!: string | null;

  @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
