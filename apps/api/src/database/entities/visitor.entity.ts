import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Global directory, not society-scoped — see migration comment. */
@Entity('visitors')
export class Visitor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 15, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null;

  @Column({ type: 'text', name: 'photo_url', nullable: true })
  photoUrl!: string | null;

  @Column({ type: 'varchar', length: 30, name: 'id_proof_type', nullable: true })
  idProofType!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'id_proof_number', nullable: true })
  idProofNumber!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
