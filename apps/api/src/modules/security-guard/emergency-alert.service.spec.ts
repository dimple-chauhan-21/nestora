import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { EmergencyAlertService, toEmergencyAlertResponseDto } from './emergency-alert.service';
import { EmergencyAlert } from '../../database/entities/emergency-alert.entity';
import type { Guard } from '../../database/entities/guard.entity';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

class FakeRepo<T extends { id: string }> {
  rows: T[] = [];
  create(partial: Partial<T>): T {
    return { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...partial } as unknown as T;
  }
  async save(row: T): Promise<T> {
    const i = this.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) this.rows[i] = row;
    else this.rows.push(row);
    return row;
  }
  async findOne(options: { where: Partial<Record<string, unknown>> }): Promise<T | null> {
    return (
      this.rows.find((r) =>
        Object.entries(options.where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
      ) ?? null
    );
  }
}

class FakeGuardContext {
  constructor(private readonly guard: Guard) {}
  async resolveOrThrow(): Promise<Guard> {
    return this.guard;
  }
}

const societyId = randomUUID();
const guardUserId = randomUUID();
const PLATFORM_SCOPE: TenantScope = { societyId, flatId: null, isPlatformScope: true };

function buildService() {
  const alerts = new FakeRepo<EmergencyAlert>();
  const guard = { id: randomUUID(), societyId, userId: guardUserId, gateId: randomUUID() } as Guard;
  const guardContext = new FakeGuardContext(guard);
  const service = new EmergencyAlertService(
    alerts as unknown as import('typeorm').Repository<EmergencyAlert>,
    guardContext as unknown as import('./guard-context.service').GuardContextService,
  );
  return { service, alerts };
}

describe('EmergencyAlertService', () => {
  it('raise() creates an active alert and marks raisedByMe true for the raiser', async () => {
    const { service } = buildService();
    const alert = await service.raise({ type: 'security' }, PLATFORM_SCOPE, guardUserId);

    expect(alert.status).toBe('active');
    expect(alert.type).toBe('security');
    expect(alert.raisedByMe).toBe(true);
    expect(alert.resolutionNote).toBeFalsy(); // not yet resolved — null in real Postgres, unset on the fake-created row either way
  });

  it('raisedByMe is false for a different requester viewing the same alert', async () => {
    const { service, alerts } = buildService();
    const alert = await service.raise({ type: 'fire' }, PLATFORM_SCOPE, guardUserId);

    const otherUserId = randomUUID();
    const raw = alerts.rows.find((a) => a.id === alert.id)!;
    // Same mapping the dashboard uses, just called with a different requester id.
    expect(toEmergencyAlertResponseDto(raw, otherUserId).raisedByMe).toBe(false);
  });

  it('resolve() rejects an empty/whitespace-only resolutionNote — §5: cannot be dismissed without one', async () => {
    const { service } = buildService();
    const alert = await service.raise({ type: 'medical' }, PLATFORM_SCOPE, guardUserId);

    await expect(
      service.resolve(alert.id, { resolutionNote: '' }, PLATFORM_SCOPE, guardUserId),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.resolve(alert.id, { resolutionNote: '   ' }, PLATFORM_SCOPE, guardUserId),
    ).rejects.toThrow(BadRequestException);
  });

  it('resolve() succeeds with a real resolutionNote and cannot be resolved twice', async () => {
    const { service } = buildService();
    const alert = await service.raise({ type: 'other' }, PLATFORM_SCOPE, guardUserId);

    const resolved = await service.resolve(
      alert.id,
      { resolutionNote: 'Checked — false alarm.' },
      PLATFORM_SCOPE,
      guardUserId,
    );
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolutionNote).toBe('Checked — false alarm.');
    expect(resolved.resolvedAt).toEqual(expect.any(String));

    await expect(
      service.resolve(alert.id, { resolutionNote: 'Again' }, PLATFORM_SCOPE, guardUserId),
    ).rejects.toThrow(BadRequestException);
  });
});
