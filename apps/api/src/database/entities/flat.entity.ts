import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('flats')
export class Flat {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'tower_id', nullable: true })
  towerId!: string | null;

  @Column({ type: 'int', name: 'floor_number', nullable: true })
  floorNumber!: number | null;

  @Column({ type: 'varchar', length: 20, name: 'flat_number' })
  flatNumber!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  type!: string | null;

  @Column({ type: 'numeric', precision: 8, scale: 2, name: 'area_sqft', nullable: true })
  areaSqft!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'vacant' })
  status!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
