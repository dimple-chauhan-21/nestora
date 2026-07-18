import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** `isInternal` comments are staff-only notes — filtered out of every resident-facing response, never row-level, always field/query-level (see ComplaintService.listComments). */
@Entity('complaint_comments')
export class ComplaintComment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'complaint_id' })
  complaintId!: string;

  @Column({ type: 'uuid', name: 'author_id' })
  authorId!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'boolean', name: 'is_internal', default: false })
  isInternal!: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
