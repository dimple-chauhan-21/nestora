import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('visitor_parking_log')
export class VisitorParkingLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'uuid', name: 'slot_id' })
  slotId!: string;

  @Column({ type: 'uuid', name: 'visitor_visit_id' })
  visitorVisitId!: string;

  @Column({ type: 'timestamptz', name: 'checked_in_at' })
  checkedInAt!: Date;

  @Column({ type: 'timestamptz', name: 'checked_out_at', nullable: true })
  checkedOutAt!: Date | null;
}
