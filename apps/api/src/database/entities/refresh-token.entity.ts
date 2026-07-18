import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  /** SHA-256 hex digest — the raw refresh token is never persisted. */
  @Column({ type: 'char', length: 64, name: 'token_hash', unique: true })
  tokenHash!: string;

  @Column({ type: 'varchar', length: 255, name: 'device_id' })
  deviceId!: string;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt!: Date | null;

  /** Set when this token was rotated out, pointing at its successor — lets reuse-detection revoke the whole chain. */
  @Column({ type: 'uuid', name: 'replaced_by_id', nullable: true })
  replacedById!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
