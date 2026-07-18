import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type LedgerEntryType = 'income' | 'expense';

/** Append-only — see AGENT notes in the migration. Corrections are new rows with reversesEntryId set, never UPDATEs. */
@Entity('ledger_entries')
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'society_id' })
  societyId!: string;

  @Column({ type: 'varchar', length: 20, name: 'entry_type' })
  entryType!: LedgerEntryType;

  @Column({ type: 'varchar', length: 50 })
  category!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: 'char', length: 3, default: 'INR' })
  currency!: string;

  @Column({ type: 'varchar', length: 50, name: 'reference_type' })
  referenceType!: string;

  @Column({ type: 'uuid', name: 'reference_id' })
  referenceId!: string;

  @Column({ type: 'date', name: 'entry_date' })
  entryDate!: string;

  @Column({ type: 'uuid', name: 'reverses_entry_id', nullable: true })
  reversesEntryId!: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
