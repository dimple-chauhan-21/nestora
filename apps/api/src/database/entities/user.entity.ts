import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 15, unique: true, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  email!: string | null;

  @Column({ type: 'text', name: 'password_hash', nullable: true })
  passwordHash!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending_verification' })
  status!: string;

  @Column({ type: 'timestamptz', name: 'phone_verified_at', nullable: true })
  phoneVerifiedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'email_verified_at', nullable: true })
  emailVerifiedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
