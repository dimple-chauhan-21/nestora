import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { LedgerService } from './ledger.service';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import type { Clock } from '../../common/clock';

class FakeClock implements Clock {
  private current = new Date('2026-03-01T00:00:00.000Z');
  now(): Date {
    return this.current;
  }
}

class FakeLedgerRepo {
  rows: LedgerEntry[] = [];
  create(partial: Partial<LedgerEntry>): LedgerEntry {
    return { id: randomUUID(), createdAt: new Date(), ...partial } as LedgerEntry;
  }
  async save(row: LedgerEntry): Promise<LedgerEntry> {
    this.rows.push(row);
    return row;
  }
  async findOne(options: { where: { id: string } }): Promise<LedgerEntry | null> {
    return this.rows.find((r) => r.id === options.where.id) ?? null;
  }
}

describe('LedgerService — append-only, reversing-entry correction pattern', () => {
  let repo: FakeLedgerRepo;
  let service: LedgerService;
  const societyId = randomUUID();
  const paymentId = randomUUID();

  beforeEach(() => {
    repo = new FakeLedgerRepo();
    service = new LedgerService(repo as unknown as Repository<LedgerEntry>, new FakeClock());
  });

  it('post() always inserts a new row, never mutates an existing one', async () => {
    const entry = await service.post({
      societyId,
      entryType: 'income',
      category: 'maintenance_payment',
      amount: '2500.00',
      referenceType: 'payment',
      referenceId: paymentId,
      createdBy: null,
    });

    expect(repo.rows).toHaveLength(1);
    expect(entry.reversesEntryId).toBeNull();
  });

  it('reverse() posts a brand-new opposite-type entry referencing the original — the original row is untouched', async () => {
    const original = await service.post({
      societyId,
      entryType: 'income',
      category: 'maintenance_payment',
      amount: '2500.00',
      referenceType: 'payment',
      referenceId: paymentId,
      createdBy: null,
    });
    const originalSnapshot = { ...original };

    const reversal = await service.reverse(original.id, 'admin-1');

    // Two rows now exist — nothing was deleted or updated in place.
    expect(repo.rows).toHaveLength(2);

    // The original entry's own fields are byte-for-byte unchanged.
    const reloadedOriginal = await repo.findOne({ where: { id: original.id } });
    expect(reloadedOriginal).toEqual(originalSnapshot);

    // The reversal is a distinct row with the opposite entry_type, same
    // amount/category, explicitly pointing back at what it corrects.
    expect(reversal.id).not.toBe(original.id);
    expect(reversal.entryType).toBe('expense');
    expect(reversal.amount).toBe(original.amount);
    expect(reversal.reversesEntryId).toBe(original.id);
    expect(reversal.createdBy).toBe('admin-1');
  });

  it('reversing an expense entry posts an income entry (the correction flips the sign, not just the label)', async () => {
    const original = await service.post({
      societyId,
      entryType: 'expense',
      category: 'refund',
      amount: '500.00',
      referenceType: 'payment',
      referenceId: paymentId,
      createdBy: null,
    });

    const reversal = await service.reverse(original.id, 'admin-1');
    expect(reversal.entryType).toBe('income');
  });

  it('throws if the entry being reversed does not exist', async () => {
    await expect(service.reverse(randomUUID(), 'admin-1')).rejects.toThrow('Ledger entry not found');
  });
});
