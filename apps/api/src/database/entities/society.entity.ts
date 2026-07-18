import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('societies')
export class Society {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'company_id', nullable: true })
  companyId!: string | null;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  pincode!: string | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, name: 'geo_lat', nullable: true })
  geoLat!: string | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, name: 'geo_lng', nullable: true })
  geoLng!: string | null;

  @Column({ type: 'varchar', length: 50, default: 'Asia/Kolkata' })
  timezone!: string;

  @Column({ type: 'char', length: 3, default: 'INR' })
  currency!: string;

  @Column({ type: 'varchar', length: 100, name: 'registration_number', nullable: true })
  registrationNumber!: string | null;

  @Column({ type: 'jsonb', default: {} })
  branding!: Record<string, unknown>;

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
