import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type ParkingSlotType = 'covered' | 'open' | '2-wheeler' | '4-wheeler';
export type ParkingSlotStatus = 'allocated' | 'vacant' | 'reserved' | 'blocked';

@Entity('parking_slots')
export class ParkingSlot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'varchar', length: 20, name: 'slot_number' })
  slotNumber!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  zone!: string | null;

  @Column({ type: 'varchar', length: 20 })
  type!: ParkingSlotType;

  @Column({ type: 'varchar', length: 20, default: 'vacant' })
  status!: ParkingSlotStatus;

  @Column({ type: 'boolean', name: 'is_visitor_pool', default: false })
  isVisitorPool!: boolean;

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
