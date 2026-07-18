import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** `complaintId` is UNIQUE at the DB level — one escalation row per complaint, the idempotency guard the SLA-breach sweep relies on. */
@Entity('complaint_escalations')
export class ComplaintEscalation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'complaint_id' })
  complaintId!: string;

  @Column({ type: 'timestamptz', name: 'escalated_at' })
  escalatedAt!: Date;

  @Column({ type: 'uuid', name: 'escalated_to', nullable: true })
  escalatedTo!: string | null;

  @Column({ type: 'text' })
  reason!: string;
}
