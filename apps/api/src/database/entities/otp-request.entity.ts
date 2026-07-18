import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('otp_requests')
export class OtpRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 15 })
  phone!: string;

  /** SHA-256 hex digest of the 6-digit OTP — never stored plaintext. */
  @Column({ type: 'char', length: 64, name: 'otp_hash' })
  otpHash!: string;

  @Column({ type: 'varchar', length: 20 })
  purpose!: 'login' | 'signup' | 'reset';

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', name: 'consumed_at', nullable: true })
  consumedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'locked_until', nullable: true })
  lockedUntil!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
