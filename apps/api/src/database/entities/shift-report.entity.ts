import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('shift_reports')
export class ShiftReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'guard_id' })
  guardId!: string;

  @Column({ type: 'uuid', name: 'gate_id' })
  gateId!: string;

  @Column({ type: 'date', name: 'shift_date' })
  shiftDate!: string;

  @Column({ type: 'int', name: 'entries_count', default: 0 })
  entriesCount!: number;

  @Column({ type: 'int', name: 'exits_count', default: 0 })
  exitsCount!: number;

  @Column({ type: 'int', name: 'alerts_count', default: 0 })
  alertsCount!: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
