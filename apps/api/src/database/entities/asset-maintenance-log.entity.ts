import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('asset_maintenance_log')
export class AssetMaintenanceLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'asset_id' })
  assetId!: string;

  @Column({ type: 'date', name: 'service_date' })
  serviceDate!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  cost!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  vendor!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
