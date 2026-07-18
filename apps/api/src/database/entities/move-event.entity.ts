import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('move_events')
export class MoveEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'flat_id' })
  flatId!: string;

  @Column({ type: 'uuid', name: 'resident_id' })
  residentId!: string;

  @Column({ type: 'varchar', length: 20, name: 'event_type' })
  eventType!: 'move_in' | 'move_out';

  @Column({ type: 'jsonb', name: 'checklist_json', default: {} })
  checklistJson!: Record<string, unknown>;

  @Column({ type: 'boolean', name: 'dues_cleared', default: false })
  duesCleared!: boolean;

  @Column({ type: 'text', name: 'override_reason', nullable: true })
  overrideReason!: string | null;

  @Column({ type: 'uuid', name: 'overridden_by', nullable: true })
  overriddenBy!: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
