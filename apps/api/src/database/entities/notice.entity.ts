import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type NoticeTargetAudience =
  | { type: 'all' }
  | { type: 'tower_ids'; towerIds: string[] }
  | { type: 'role'; role: string };

@Entity('notices')
export class Notice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category!: string | null;

  @Column({ type: 'jsonb', name: 'target_audience' })
  targetAudience!: NoticeTargetAudience;

  /** Snapshot of recipient user IDs, resolved once at creation/publish time — never re-resolved on read (deliverable #7). */
  @Column({ type: 'jsonb', name: 'resolved_recipient_user_ids', default: () => "'[]'" })
  resolvedRecipientUserIds!: string[];

  @Column({ type: 'boolean', name: 'is_pinned', default: false })
  isPinned!: boolean;

  @Column({ type: 'timestamptz', name: 'expires_at', nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'uuid', name: 'published_by', nullable: true })
  publishedBy!: string | null;

  @Column({ type: 'timestamptz', name: 'published_at', nullable: true })
  publishedAt!: Date | null;

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
