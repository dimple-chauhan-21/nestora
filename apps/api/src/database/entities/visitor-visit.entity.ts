import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type VisitType = 'walk_in' | 'pre_approved' | 'recurring';
export type VisitStatus = 'pending' | 'approved' | 'rejected' | 'checked_in' | 'checked_out' | 'expired';

/** Partitioned by created_at (composite PK (id, created_at) at the DB level) — same TypeORM-metadata simplification as LoginAudit: `id` alone is treated as the entity's PK, which is sufficient for the CRUD this app does. */
@Entity('visitor_visits')
export class VisitorVisit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'visitor_id' })
  visitorId!: string;

  @Column({ type: 'uuid', name: 'flat_id' })
  flatId!: string;

  @Column({ type: 'varchar', length: 20, name: 'visit_type' })
  visitType!: VisitType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  purpose!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: VisitStatus;

  @Column({ type: 'text', name: 'qr_code', nullable: true })
  qrCode!: string | null;

  @Column({ type: 'timestamptz', name: 'valid_from', nullable: true })
  validFrom!: Date | null;

  @Column({ type: 'timestamptz', name: 'valid_to', nullable: true })
  validTo!: Date | null;

  @Column({ type: 'uuid', name: 'approved_by', nullable: true })
  approvedBy!: string | null;

  @Column({ type: 'timestamptz', name: 'approved_at', nullable: true })
  approvedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'escalated_at', nullable: true })
  escalatedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
