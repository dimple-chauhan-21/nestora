import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ParkingSlot } from '../../database/entities/parking-slot.entity';
import { ParkingAllocation } from '../../database/entities/parking-allocation.entity';
import { VisitorParkingLog } from '../../database/entities/visitor-parking-log.entity';
import { ParkingViolation } from '../../database/entities/parking-violation.entity';
import { Flat } from '../../database/entities/flat.entity';
import { CLOCK, type Clock } from '../../common/clock';
import { assertSocietyMatch } from '../../common/tenant-scope/tenant-scope.util';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import { CreateParkingSlotDto } from './dto/create-parking-slot.dto';
import { CreateAllocationDto } from './dto/create-allocation.dto';
import { CreateViolationDto } from './dto/create-violation.dto';
import { ResolveViolationDto } from './dto/resolve-violation.dto';

@Injectable()
export class ParkingService {
  constructor(
    @InjectRepository(ParkingSlot) private readonly slots: Repository<ParkingSlot>,
    @InjectRepository(ParkingAllocation) private readonly allocations: Repository<ParkingAllocation>,
    @InjectRepository(VisitorParkingLog) private readonly visitorParkingLog: Repository<VisitorParkingLog>,
    @InjectRepository(ParkingViolation) private readonly violations: Repository<ParkingViolation>,
    @InjectRepository(Flat) private readonly flats: Repository<Flat>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createSlot(dto: CreateParkingSlotDto, scope: TenantScope, actorId: string): Promise<ParkingSlot> {
    if (scope.isPlatformScope || !scope.societyId) {
      throw new NotFoundException('A society-scoped caller is required to define parking slots');
    }
    const slot = this.slots.create({
      societyId: scope.societyId,
      slotNumber: dto.slotNumber,
      zone: dto.zone ?? null,
      type: dto.type,
      isVisitorPool: dto.isVisitorPool ?? false,
      status: 'vacant',
      createdBy: actorId,
      updatedBy: actorId,
    });
    return this.slots.save(slot);
  }

  private async loadSlotOrThrow(slotId: string): Promise<ParkingSlot> {
    const slot = await this.slots.findOne({ where: { id: slotId } });
    if (!slot) throw new NotFoundException('Parking slot not found');
    return slot;
  }

  /** Admin-driven per §6's user flow ("Admin... allocates slots to flats") — not resident self-service, so no ABAC flat-narrowing here (only society-wide roles hold parking:manage). */
  async createAllocation(dto: CreateAllocationDto, scope: TenantScope, actorId: string): Promise<ParkingAllocation> {
    const slot = await this.loadSlotOrThrow(dto.slotId);
    assertSocietyMatch(slot.societyId, scope);
    if (slot.status === 'blocked') {
      throw new ConflictException('Slot is under maintenance and excluded from allocation');
    }

    const flat = await this.flats.findOne({ where: { id: dto.flatId } });
    if (!flat) throw new NotFoundException('Flat not found');
    assertSocietyMatch(flat.societyId, scope);

    const allocation = this.allocations.create({
      societyId: slot.societyId,
      slotId: slot.id,
      flatId: dto.flatId,
      vehicleId: dto.vehicleId ?? null,
      allocatedFrom: dto.allocatedFrom ?? this.clock.now().toISOString().slice(0, 10),
      allocatedTo: null,
      createdBy: actorId,
      updatedBy: actorId,
    });

    try {
      const saved = await this.allocations.save(allocation);
      slot.status = 'allocated';
      await this.slots.save(slot);
      return saved;
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException('This slot already has an active allocation');
      }
      throw err;
    }
  }

  async endAllocation(allocationId: string, scope: TenantScope, actorId: string): Promise<ParkingAllocation> {
    const allocation = await this.allocations.findOne({ where: { id: allocationId } });
    if (!allocation) throw new NotFoundException('Allocation not found');
    assertSocietyMatch(allocation.societyId, scope);

    if (allocation.allocatedTo) return allocation; // idempotent no-op

    allocation.allocatedTo = this.clock.now().toISOString().slice(0, 10);
    allocation.updatedBy = actorId;
    const saved = await this.allocations.save(allocation);

    const slot = await this.loadSlotOrThrow(allocation.slotId);
    if (slot.status === 'allocated') {
      slot.status = 'vacant';
      await this.slots.save(slot);
    }

    return saved;
  }

  async getAvailability(
    societyId: string,
    scope: TenantScope,
  ): Promise<{ total: number; vacant: number; allocated: number; reserved: number; blocked: number }> {
    assertSocietyMatch(societyId, scope);
    const all = await this.slots.find({ where: { societyId } });
    return {
      total: all.length,
      vacant: all.filter((s) => s.status === 'vacant').length,
      allocated: all.filter((s) => s.status === 'allocated').length,
      reserved: all.filter((s) => s.status === 'reserved').length,
      blocked: all.filter((s) => s.status === 'blocked').length,
    };
  }

  async reportViolation(dto: CreateViolationDto, scope: TenantScope, actorId: string): Promise<ParkingViolation> {
    if (scope.isPlatformScope || !scope.societyId) {
      throw new NotFoundException('A society-scoped caller is required to report a violation');
    }
    if (dto.slotId) {
      const slot = await this.loadSlotOrThrow(dto.slotId);
      assertSocietyMatch(slot.societyId, scope);
    }

    const violation = this.violations.create({
      societyId: scope.societyId,
      slotId: dto.slotId ?? null,
      reportedBy: actorId,
      photoUrl: dto.photoUrl,
      description: dto.description ?? null,
      status: 'open',
    });
    return this.violations.save(violation);
  }

  /** §6 Security: "only Manager/Committee can resolve violations (not peer residents, to avoid conflict)" — enforced by permission grant (parking:manage), not an extra scope check here. */
  async resolveViolation(violationId: string, dto: ResolveViolationDto, scope: TenantScope): Promise<ParkingViolation> {
    const violation = await this.violations.findOne({ where: { id: violationId } });
    if (!violation) throw new NotFoundException('Violation not found');
    assertSocietyMatch(violation.societyId, scope);

    violation.status = dto.status;
    return this.violations.save(violation);
  }

  /**
   * Called from GateService.scan() on a visitor check-in that needs
   * parking — augments the existing check-in flow rather than duplicating
   * it. Returns null (no hard failure) if no visitor-pool slot is free;
   * the visitor still gets checked in, they just park outside the gated
   * pool (§6's "overflow" edge case, handled minimally this session).
   */
  async allocateVisitorParking(societyId: string, visitorVisitId: string): Promise<VisitorParkingLog | null> {
    const slot = await this.slots.findOne({ where: { societyId, status: 'vacant', isVisitorPool: true } });
    if (!slot) return null;

    slot.status = 'reserved';
    await this.slots.save(slot);

    const log = this.visitorParkingLog.create({
      societyId,
      slotId: slot.id,
      visitorVisitId,
      checkedInAt: this.clock.now(),
    });
    return this.visitorParkingLog.save(log);
  }

  /** Called from GateService on visitor check-out — closes the log entry and frees the slot. No-op if the visitor never took a pool slot. */
  async releaseVisitorParking(visitorVisitId: string): Promise<void> {
    const openLog = await this.visitorParkingLog
      .createQueryBuilder('log')
      .where('log.visitor_visit_id = :visitorVisitId', { visitorVisitId })
      .andWhere('log.checked_out_at IS NULL')
      .getOne();
    if (!openLog) return;

    openLog.checkedOutAt = this.clock.now();
    await this.visitorParkingLog.save(openLog);

    const slot = await this.slots.findOne({ where: { id: openLog.slotId } });
    if (slot && slot.status === 'reserved') {
      slot.status = 'vacant';
      await this.slots.save(slot);
    }
  }
}
