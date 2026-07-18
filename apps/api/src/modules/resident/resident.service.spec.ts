import { Repository, FindOperator } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { ResidentService } from './resident.service';
import { Resident } from '../../database/entities/resident.entity';
import { LeaseDetail } from '../../database/entities/lease-detail.entity';
import { Vehicle } from '../../database/entities/vehicle.entity';
import { Pet } from '../../database/entities/pet.entity';
import { ResidentDocument } from '../../database/entities/resident-document.entity';
import { MoveEvent } from '../../database/entities/move-event.entity';
import { Flat } from '../../database/entities/flat.entity';
import { User } from '../../database/entities/user.entity';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

/** Minimal in-memory Repository<T> stand-ins — only the methods ResidentService actually calls. */
class FakeRepo<T extends { id: string }> {
  rows: T[] = [];

  create(partial: Partial<T>): T {
    return { id: randomUUID(), ...partial } as T;
  }

  async save(row: T): Promise<T> {
    const existingIndex = this.rows.findIndex((r) => r.id === row.id);
    if (existingIndex >= 0) this.rows[existingIndex] = row;
    else this.rows.push(row);
    return row;
  }

  async findOne(options: { where: Partial<Record<string, unknown>> }): Promise<T | null> {
    return this.rows.find((r) => this.matches(r, options.where)) ?? null;
  }

  async find(options: { where: Partial<Record<string, unknown>> }): Promise<T[]> {
    return this.rows.filter((r) => this.matches(r, options.where));
  }

  async update(id: string, partial: Partial<T>): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, partial);
  }

  async exist(options: { where: Partial<Record<string, unknown>> }): Promise<boolean> {
    return this.rows.some((r) => this.matches(r, options.where));
  }

  private matches(row: T, where: Partial<Record<string, unknown>>): boolean {
    return Object.entries(where).every(([key, expected]) => {
      const actual = (row as unknown as Record<string, unknown>)[key];
      if (expected instanceof FindOperator) {
        if (expected.type === 'lessThan') return (actual as string) < (expected.value as string);
        throw new Error(`FakeRepo doesn't support FindOperator type: ${expected.type}`);
      }
      return actual === expected;
    });
  }
}

const PLATFORM_SCOPE: TenantScope = { societyId: null, flatId: null, isPlatformScope: true };

describe('ResidentService.moveOut', () => {
  let residents: FakeRepo<Resident>;
  let leaseDetails: FakeRepo<LeaseDetail>;
  let moveEvents: FakeRepo<MoveEvent>;
  let flats: FakeRepo<Flat>;
  let service: ResidentService;

  const societyId = randomUUID();
  const flatId = randomUUID();
  let residentId: string;

  beforeEach(async () => {
    residents = new FakeRepo<Resident>();
    leaseDetails = new FakeRepo<LeaseDetail>();
    moveEvents = new FakeRepo<MoveEvent>();
    flats = new FakeRepo<Flat>();

    flats.rows.push({ id: flatId, societyId, status: 'occupied' } as Flat);

    const resident = residents.create({
      societyId,
      flatId,
      relationType: 'tenant',
      status: 'active',
    } as Partial<Resident>);
    await residents.save(resident);
    residentId = resident.id;

    service = new ResidentService(
      residents as unknown as Repository<Resident>,
      leaseDetails as unknown as Repository<LeaseDetail>,
      new FakeRepo<Vehicle>() as unknown as Repository<Vehicle>,
      new FakeRepo<Pet>() as unknown as Repository<Pet>,
      new FakeRepo<ResidentDocument>() as unknown as Repository<ResidentDocument>,
      moveEvents as unknown as Repository<MoveEvent>,
      flats as unknown as Repository<Flat>,
      new FakeRepo<User>() as unknown as Repository<User>,
    );
  });

  it('blocks move-out when dues_cleared=false and no override is given', async () => {
    const result = await service.moveOut(
      flatId,
      { residentId, duesCleared: false },
      PLATFORM_SCOPE,
      'actor-1',
    );

    expect(result.blocked).toBe(true);
    const resident = await residents.findOne({ where: { id: residentId } });
    expect(resident?.status).toBe('active'); // not moved out
    expect(result.moveEvent.duesCleared).toBe(false);
    expect(result.moveEvent.overrideReason).toBeNull();
  });

  it('blocks move-out when dues_cleared=false and override=true but no reason is provided', async () => {
    const result = await service.moveOut(
      flatId,
      { residentId, duesCleared: false, override: true },
      PLATFORM_SCOPE,
      'actor-1',
    );

    expect(result.blocked).toBe(true);
  });

  it('allows move-out when dues_cleared=false but an admin overrides with a reason', async () => {
    const result = await service.moveOut(
      flatId,
      { residentId, duesCleared: false, override: true, overrideReason: 'Deposit forfeited, dues waived by committee' },
      PLATFORM_SCOPE,
      'actor-1',
    );

    expect(result.blocked).toBe(false);
    const resident = await residents.findOne({ where: { id: residentId } });
    expect(resident?.status).toBe('moved_out');
    expect(result.moveEvent.overrideReason).toBe('Deposit forfeited, dues waived by committee');
    expect(result.moveEvent.overriddenBy).toBe('actor-1');
  });

  it('allows move-out immediately when dues_cleared=true', async () => {
    const result = await service.moveOut(flatId, { residentId, duesCleared: true }, PLATFORM_SCOPE, 'actor-1');

    expect(result.blocked).toBe(false);
    const resident = await residents.findOne({ where: { id: residentId } });
    expect(resident?.status).toBe('moved_out');
  });

  it('marks the flat vacant once its last active resident moves out', async () => {
    await service.moveOut(flatId, { residentId, duesCleared: true }, PLATFORM_SCOPE, 'actor-1');
    const flat = await flats.findOne({ where: { id: flatId } });
    expect(flat?.status).toBe('vacant');
  });

  it('rejects a residentId that does not belong to the target flat', async () => {
    const otherFlatId = randomUUID();
    flats.rows.push({ id: otherFlatId, societyId, status: 'occupied' } as Flat);
    const otherResident = residents.create({
      societyId,
      flatId: otherFlatId,
      relationType: 'tenant',
      status: 'active',
    } as Partial<Resident>);
    await residents.save(otherResident);

    await expect(
      service.moveOut(flatId, { residentId: otherResident.id, duesCleared: true }, PLATFORM_SCOPE, 'actor-1'),
    ).rejects.toThrow(/does not belong to this flat/);
  });
});

describe('ResidentService.suspendExpiredLeases', () => {
  it('suspends a tenant whose lease has ended, without deleting the resident row', async () => {
    const residents = new FakeRepo<Resident>();
    const leaseDetails = new FakeRepo<LeaseDetail>();
    const societyId = randomUUID();
    const flatId = randomUUID();

    const resident = residents.create({
      societyId,
      flatId,
      relationType: 'tenant',
      status: 'active',
    } as Partial<Resident>);
    await residents.save(resident);

    const lease = leaseDetails.create({
      societyId,
      residentId: resident.id,
      leaseStart: '2025-01-01',
      leaseEnd: '2025-12-31',
    } as Partial<LeaseDetail>);
    await leaseDetails.save(lease);

    const service = new ResidentService(
      residents as unknown as Repository<Resident>,
      leaseDetails as unknown as Repository<LeaseDetail>,
      new FakeRepo<Vehicle>() as unknown as Repository<Vehicle>,
      new FakeRepo<Pet>() as unknown as Repository<Pet>,
      new FakeRepo<ResidentDocument>() as unknown as Repository<ResidentDocument>,
      new FakeRepo<MoveEvent>() as unknown as Repository<MoveEvent>,
      new FakeRepo<Flat>() as unknown as Repository<Flat>,
      new FakeRepo<User>() as unknown as Repository<User>,
    );

    const suspendedCount = await service.suspendExpiredLeases(new Date('2026-01-15'));

    expect(suspendedCount).toBe(1);
    const updated = await residents.findOne({ where: { id: resident.id } });
    expect(updated?.status).toBe('suspended'); // not deleted — row still exists, still queryable
    expect(updated).not.toBeNull();
  });

  it('does not touch a lease that has not yet ended', async () => {
    const residents = new FakeRepo<Resident>();
    const leaseDetails = new FakeRepo<LeaseDetail>();
    const societyId = randomUUID();
    const flatId = randomUUID();

    const resident = residents.create({
      societyId,
      flatId,
      relationType: 'tenant',
      status: 'active',
    } as Partial<Resident>);
    await residents.save(resident);

    const lease = leaseDetails.create({
      societyId,
      residentId: resident.id,
      leaseStart: '2026-01-01',
      leaseEnd: '2026-12-31',
    } as Partial<LeaseDetail>);
    await leaseDetails.save(lease);

    const service = new ResidentService(
      residents as unknown as Repository<Resident>,
      leaseDetails as unknown as Repository<LeaseDetail>,
      new FakeRepo<Vehicle>() as unknown as Repository<Vehicle>,
      new FakeRepo<Pet>() as unknown as Repository<Pet>,
      new FakeRepo<ResidentDocument>() as unknown as Repository<ResidentDocument>,
      new FakeRepo<MoveEvent>() as unknown as Repository<MoveEvent>,
      new FakeRepo<Flat>() as unknown as Repository<Flat>,
      new FakeRepo<User>() as unknown as Repository<User>,
    );

    const suspendedCount = await service.suspendExpiredLeases(new Date('2026-06-01'));

    expect(suspendedCount).toBe(0);
    const unchanged = await residents.findOne({ where: { id: resident.id } });
    expect(unchanged?.status).toBe('active');
  });

  it('does not re-suspend an owner (only active tenants with an expired lease)', async () => {
    const residents = new FakeRepo<Resident>();
    const leaseDetails = new FakeRepo<LeaseDetail>();
    const societyId = randomUUID();
    const flatId = randomUUID();

    // An owner shouldn't normally have a lease row, but guard the business
    // rule directly in case one is ever created by mistake.
    const owner = residents.create({
      societyId,
      flatId,
      relationType: 'owner',
      status: 'active',
    } as Partial<Resident>);
    await residents.save(owner);

    const lease = leaseDetails.create({
      societyId,
      residentId: owner.id,
      leaseStart: '2025-01-01',
      leaseEnd: '2025-12-31',
    } as Partial<LeaseDetail>);
    await leaseDetails.save(lease);

    const service = new ResidentService(
      residents as unknown as Repository<Resident>,
      leaseDetails as unknown as Repository<LeaseDetail>,
      new FakeRepo<Vehicle>() as unknown as Repository<Vehicle>,
      new FakeRepo<Pet>() as unknown as Repository<Pet>,
      new FakeRepo<ResidentDocument>() as unknown as Repository<ResidentDocument>,
      new FakeRepo<MoveEvent>() as unknown as Repository<MoveEvent>,
      new FakeRepo<Flat>() as unknown as Repository<Flat>,
      new FakeRepo<User>() as unknown as Repository<User>,
    );

    const suspendedCount = await service.suspendExpiredLeases(new Date('2026-01-15'));

    expect(suspendedCount).toBe(0);
    const unchanged = await residents.findOne({ where: { id: owner.id } });
    expect(unchanged?.status).toBe('active');
  });
});
