import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type GateLogEntityType = 'visitor' | 'delivery' | 'staff' | 'vehicle';
export type GateLogDirection = 'in' | 'out';
export type GateLogMethod = 'qr' | 'manual' | 'facial';

/** Partitioned by occurred_at — same TypeORM-metadata simplification as LoginAudit/VisitorVisit. */
@Entity('gate_logs')
export class GateLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'gate_id' })
  gateId!: string;

  @Column({ type: 'uuid', name: 'guard_id' })
  guardId!: string;

  @Column({ type: 'varchar', length: 20, name: 'entity_type' })
  entityType!: GateLogEntityType;

  /** Not a hard FK — see migration comment (partitioned parent, composite PK). */
  @Column({ type: 'uuid', name: 'visitor_visit_id', nullable: true })
  visitorVisitId!: string | null;

  @Column({ type: 'varchar', length: 10 })
  direction!: GateLogDirection;

  @Column({ type: 'varchar', length: 20 })
  method!: GateLogMethod;

  @Column({ type: 'text', name: 'override_reason', nullable: true })
  overrideReason!: string | null;

  @Column({ type: 'uuid', name: 'idempotency_key' })
  idempotencyKey!: string;

  /**
   * The kiosk's own locally-recorded timestamp, preserved as reported —
   * `occurred_at` (server-assigned) stays authoritative for ordering/queries,
   * this is for "when did this actually happen" reporting when the two
   * diverge (offline sync). Null for live (online) writes. Sanity-bounded at
   * write time (rejected — not silently trusted — if more than ~24h off from
   * server time); see GateService.
   */
  @Column({ type: 'timestamptz', name: 'occurred_at_client_reported', nullable: true })
  occurredAtClientReported!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'occurred_at' })
  occurredAt!: Date;
}
