import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type DeliveryStatus = 'pending' | 'handed_over' | 'returned';

@Entity('deliveries')
export class Delivery {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'flat_id' })
  flatId!: string;

  @Column({ type: 'uuid', name: 'agent_id' })
  agentId!: string;

  @Column({ type: 'uuid', name: 'gate_id' })
  gateId!: string;

  @Column({ type: 'uuid', name: 'guard_id' })
  guardId!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  platform!: string | null;

  @Column({ type: 'text', name: 'parcel_photo_url', nullable: true })
  parcelPhotoUrl!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: DeliveryStatus;

  /** Hashed (sha256), never the raw code — see migration comment. Never exposed to the guard, only a verified/not-verified boolean. */
  @Column({ type: 'char', length: 64, name: 'otp_hash' })
  otpHash!: string;

  @Column({ type: 'timestamptz', name: 'otp_expires_at' })
  otpExpiresAt!: Date;

  @Column({ type: 'int', name: 'otp_attempts', default: 0 })
  otpAttempts!: number;

  @Column({ type: 'timestamptz', name: 'otp_verified_at', nullable: true })
  otpVerifiedAt!: Date | null;

  /** Resident absent — parcel held at the security desk; status stays 'pending'. */
  @Column({ type: 'boolean', name: 'held_at_desk', default: false })
  heldAtDesk!: boolean;

  /** Set only when handed_over without a matching OTP — guard override for elderly/no-smartphone residents, per §6. */
  @Column({ type: 'text', name: 'handover_override_reason', nullable: true })
  handoverOverrideReason!: string | null;

  @Column({ type: 'uuid', name: 'idempotency_key', nullable: true })
  idempotencyKey!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
