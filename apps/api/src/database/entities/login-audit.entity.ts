import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Insert-only (see migration REVOKE UPDATE/DELETE grant) — every login/OTP attempt writes a row. */
@Entity('login_audit')
export class LoginAudit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 30 })
  channel!: 'otp' | 'password' | 'refresh';

  @Column({ type: 'inet', nullable: true })
  ip!: string | null;

  @Column({ type: 'text', nullable: true })
  device!: string | null;

  @Column({ type: 'boolean' })
  success!: boolean;

  @Column({ type: 'varchar', length: 100, name: 'failure_reason', nullable: true })
  failureReason!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'occurred_at' })
  occurredAt!: Date;
}
