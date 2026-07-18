import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type AssetStatus = 'active' | 'under_repair' | 'retired';

@Entity('assets')
export class Asset {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category!: string | null;

  @Column({ type: 'date', name: 'purchase_date', nullable: true })
  purchaseDate!: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'purchase_cost', nullable: true })
  purchaseCost!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  vendor!: string | null;

  @Column({ type: 'date', name: 'warranty_expires_at', nullable: true })
  warrantyExpiresAt!: string | null;

  @Column({ type: 'uuid', name: 'assigned_to_staff_id', nullable: true })
  assignedToStaffId!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'assigned_to_location', nullable: true })
  assignedToLocation!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: AssetStatus;

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
