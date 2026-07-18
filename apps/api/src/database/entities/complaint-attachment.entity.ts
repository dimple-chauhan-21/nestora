import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type ComplaintAttachmentType = 'image' | 'video';

@Entity('complaint_attachments')
export class ComplaintAttachment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'complaint_id' })
  complaintId!: string;

  @Column({ type: 'text', name: 'file_url' })
  fileUrl!: string;

  @Column({ type: 'varchar', length: 10 })
  type!: ComplaintAttachmentType;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
