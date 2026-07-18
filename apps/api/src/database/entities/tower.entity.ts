import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Minimal FK target for flats.tower_id (SRS 10.3 references towers(id) but
 * doesn't define the table — Module 2 owns the real definition). Kept
 * intentionally bare here; Phase 1's `society` module replaces/extends this.
 */
@Entity('towers')
export class Tower {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'varchar', length: 50 })
  name!: string;

  @Column({ type: 'int', name: 'total_floors', nullable: true })
  totalFloors!: number | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
