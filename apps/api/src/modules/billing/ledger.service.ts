import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { LedgerEntry, LedgerEntryType } from '../../database/entities/ledger-entry.entity';
import { CLOCK, type Clock } from '../../common/clock';

export interface PostLedgerEntryInput {
  societyId: string;
  entryType: LedgerEntryType;
  category: string;
  amount: string;
  referenceType: string;
  referenceId: string;
  createdBy: string | null;
}

/**
 * Append-only in practice (§12): `post` always inserts a new row;
 * `reverse` also always inserts a new row (the opposite entry_type,
 * pointing back at the original via reverses_entry_id) — there is no
 * update/delete path on a posted entry anywhere in this service.
 *
 * Every method accepts an optional `manager` so it can participate in a
 * caller-managed transaction (the webhook handler needs the ledger post to
 * commit atomically with the payment status flip and receipt creation —
 * see WebhookService).
 */
@Injectable()
export class LedgerService {
  constructor(
    @InjectRepository(LedgerEntry) private readonly ledgerEntries: Repository<LedgerEntry>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async post(input: PostLedgerEntryInput, manager?: EntityManager): Promise<LedgerEntry> {
    const repo = manager ? manager.getRepository(LedgerEntry) : this.ledgerEntries;
    const entry = repo.create({
      societyId: input.societyId,
      entryType: input.entryType,
      category: input.category,
      amount: input.amount,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      entryDate: this.clock.now().toISOString().slice(0, 10),
      reversesEntryId: null,
      createdBy: input.createdBy,
    });
    return repo.save(entry);
  }

  /** A correction: a brand-new row referencing the original, never an UPDATE to it. */
  async reverse(
    originalEntryId: string,
    actorId: string | null,
    manager?: EntityManager,
  ): Promise<LedgerEntry> {
    const repo = manager ? manager.getRepository(LedgerEntry) : this.ledgerEntries;
    const original = await repo.findOne({ where: { id: originalEntryId } });
    if (!original) throw new NotFoundException('Ledger entry not found');

    const reversal = repo.create({
      societyId: original.societyId,
      entryType: original.entryType === 'income' ? 'expense' : 'income',
      category: original.category,
      amount: original.amount,
      referenceType: original.referenceType,
      referenceId: original.referenceId,
      entryDate: this.clock.now().toISOString().slice(0, 10),
      reversesEntryId: original.id,
      createdBy: actorId,
    });
    return repo.save(reversal);
  }
}
