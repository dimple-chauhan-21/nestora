import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** `UNIQUE(notice_id, user_id)` at the DB level makes "mark as read" idempotent — a retried open never creates a second row. */
@Entity('notice_reads')
export class NoticeRead {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'notice_id' })
  noticeId!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'timestamptz', name: 'read_at' })
  readAt!: Date;
}
