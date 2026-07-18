import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { GateLog } from '../../database/entities/gate-log.entity';
import { VisitorVisit } from '../../database/entities/visitor-visit.entity';
import { GuardContextService } from './guard-context.service';
import { QrTokenService } from '../visitor/qr/qr-token.service';
import { GuestInviteService } from '../visitor/guest-invite.service';
import { ParkingService } from '../parking/parking.service';
import { CLOCK, type Clock } from '../../common/clock';
import { assertGateMatch } from './gate-scope/gate-scope.util';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import { assertSocietyMatch } from '../../common/tenant-scope/tenant-scope.util';
import { GateScanDto } from './dto/gate-scan.dto';
import { GateManualEntryDto } from './dto/gate-manual-entry.dto';

const CLIENT_TIMESTAMP_SANITY_BOUND_MS = 24 * 60 * 60 * 1000; // 24h, per session decision

@Injectable()
export class GateService {
  constructor(
    @InjectRepository(GateLog) private readonly gateLogs: Repository<GateLog>,
    @InjectRepository(VisitorVisit) private readonly visits: Repository<VisitorVisit>,
    private readonly guardContext: GuardContextService,
    private readonly qrTokenService: QrTokenService,
    private readonly guestInviteService: GuestInviteService,
    private readonly parkingService: ParkingService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Sanity-bounds a client-reported timestamp rather than trusting it blindly — out-of-bounds values are dropped (logged as null), never silently clamped or stored as-is. */
  private sanitizeClientTimestamp(raw: string | undefined): Date | null {
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    const drift = Math.abs(this.clock.now().getTime() - parsed.getTime());
    if (drift > CLIENT_TIMESTAMP_SANITY_BOUND_MS) return null;
    return parsed;
  }

  /**
   * Public specifically so DeliveryService can reuse it (§6 Module 6's
   * arrival log is a gate_logs row like any other, `entity_type =
   * 'delivery'`) instead of forking its own INSERT — the one write path
   * for every gate_logs row, visitor or delivery.
   */
  async writeGateLog(input: {
    societyId: string;
    gateId: string;
    guardId: string;
    entityType: GateLog['entityType'];
    visitorVisitId: string | null;
    direction: GateLog['direction'];
    method: GateLog['method'];
    overrideReason: string | null;
    idempotencyKey: string;
    occurredAtClientReported: Date | null;
  }): Promise<GateLog> {
    const existing = await this.gateLogs.findOne({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing; // idempotent replay — return the original, don't double-log

    const log = this.gateLogs.create(input);
    return this.gateLogs.save(log);
  }

  async scan(dto: GateScanDto, scope: TenantScope, guardUserId: string): Promise<GateLog> {
    const guard = await this.guardContext.resolveOrThrow(guardUserId);
    assertSocietyMatch(guard.societyId, scope);
    assertGateMatch(dto.gateId, guard.gateId);

    const payload = this.qrTokenService.verify(dto.token);
    const idempotencyKey = dto.idempotencyKey ?? randomUUID();
    const occurredAtClientReported = this.sanitizeClientTimestamp(dto.occurredAtClientReported);

    if (payload.purpose === 'visitor_visit') {
      const visit = await this.visits.findOne({ where: { id: payload.sub } });
      if (!visit) throw new NotFoundException('Visit not found');
      if (visit.status !== 'approved' && dto.direction === 'in') {
        throw new BadRequestException(`Cannot check in a visit with status "${visit.status}"`);
      }

      visit.status = dto.direction === 'in' ? 'checked_in' : 'checked_out';
      await this.visits.save(visit);

      // Visitor parking rides on the existing check-in/check-out
      // transition above — not a duplicated check-in path. Allocation
      // failure (no pool slot free) never blocks the check-in itself.
      if (dto.direction === 'in' && dto.needsParking) {
        await this.parkingService.allocateVisitorParking(guard.societyId, visit.id);
      } else if (dto.direction === 'out') {
        await this.parkingService.releaseVisitorParking(visit.id);
      }

      return this.writeGateLog({
        societyId: guard.societyId,
        gateId: dto.gateId,
        guardId: guard.id,
        entityType: 'visitor',
        visitorVisitId: visit.id,
        direction: dto.direction,
        method: 'qr',
        overrideReason: null,
        idempotencyKey,
        occurredAtClientReported,
      });
    }

    // guest_invite
    const invite = await this.guestInviteService.resolveByToken(dto.token);
    await this.guestInviteService.consume(invite.id);

    return this.writeGateLog({
      societyId: guard.societyId,
      gateId: dto.gateId,
      guardId: guard.id,
      entityType: 'visitor',
      visitorVisitId: null,
      direction: dto.direction,
      method: 'qr',
      overrideReason: null,
      idempotencyKey,
      occurredAtClientReported,
    });
  }

  async manualEntry(dto: GateManualEntryDto, scope: TenantScope, guardUserId: string): Promise<GateLog> {
    const guard = await this.guardContext.resolveOrThrow(guardUserId);
    assertSocietyMatch(guard.societyId, scope);
    assertGateMatch(dto.gateId, guard.gateId);

    const idempotencyKey = dto.idempotencyKey ?? randomUUID();
    const occurredAtClientReported = this.sanitizeClientTimestamp(dto.occurredAtClientReported);

    return this.writeGateLog({
      societyId: guard.societyId,
      gateId: dto.gateId,
      guardId: guard.id,
      entityType: dto.entityType,
      visitorVisitId: null,
      direction: dto.direction,
      method: 'manual',
      overrideReason: dto.overrideReason,
      idempotencyKey,
      occurredAtClientReported,
    });
  }
}
