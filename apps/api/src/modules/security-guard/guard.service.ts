import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GateLog } from '../../database/entities/gate-log.entity';
import { VisitorVisit } from '../../database/entities/visitor-visit.entity';
import { EmergencyAlert } from '../../database/entities/emergency-alert.entity';
import { ShiftReport } from '../../database/entities/shift-report.entity';
import { Resident } from '../../database/entities/resident.entity';
import { Flat } from '../../database/entities/flat.entity';
import { Delivery } from '../../database/entities/delivery.entity';
import { GuardContextService } from './guard-context.service';
import { AuthService, type RequestContext } from '../auth/auth.service';
import { TokenService, type IssuedTokenPair } from '../auth/token.service';
import { VisitApprovalService } from '../visitor/visit-approval.service';
import {
  NOTIFICATION_PROVIDER,
  type NotificationProvider,
} from '../notification/notification-provider.interface';
import { GuardLoginDto } from './dto/guard-login.dto';
import { CallResidentDto } from './dto/call-resident.dto';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import { assertSocietyMatch } from '../../common/tenant-scope/tenant-scope.util';

export interface GuardLoginResult extends IssuedTokenPair {
  guard: { id: string; gateId: string; societyId: string };
}

export interface GuardDashboard {
  gateId: string;
  societyId: string;
  pendingVisits: VisitorVisit[];
  pendingDeliveries: Delivery[];
  escalatedJustNow: number;
  activeAlerts: EmergencyAlert[];
  todayEntries: number;
  todayExits: number;
}

@Injectable()
export class GuardService {
  constructor(
    @InjectRepository(GateLog) private readonly gateLogs: Repository<GateLog>,
    @InjectRepository(VisitorVisit) private readonly visits: Repository<VisitorVisit>,
    @InjectRepository(EmergencyAlert) private readonly alerts: Repository<EmergencyAlert>,
    @InjectRepository(ShiftReport) private readonly shiftReports: Repository<ShiftReport>,
    @InjectRepository(Resident) private readonly residents: Repository<Resident>,
    @InjectRepository(Flat) private readonly flats: Repository<Flat>,
    @InjectRepository(Delivery) private readonly deliveries: Repository<Delivery>,
    private readonly guardContext: GuardContextService,
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
    private readonly visitApprovalService: VisitApprovalService,
    @Inject(NOTIFICATION_PROVIDER) private readonly notifications: NotificationProvider,
  ) {}

  /**
   * Reuses Module 1's OTP flow rather than a second PIN/biometric scheme —
   * see GuardLoginDto's comment. `gateId` is the explicit gate-switch
   * action: logging in at a kiosk physically bound to a gate rebinds the
   * guard's active gate there and then.
   */
  async login(dto: GuardLoginDto, ctx: RequestContext): Promise<GuardLoginResult> {
    const tokens = await this.authService.verifyOtp(dto.phone, dto.otp, dto.deviceId, ctx);
    const payload = this.tokenService.verifyAccessToken(tokens.accessToken);

    const guard = await this.guardContext.resolveOrThrow(payload.sub);
    await this.guardContext.assignGate(guard, dto.gateId);

    return {
      ...tokens,
      guard: { id: guard.id, gateId: dto.gateId, societyId: guard.societyId },
    };
  }

  /**
   * The real trigger for approval-timeout escalation in the running app:
   * every dashboard poll sweeps this society's overdue pending visits.
   * Desktop kiosk polls this at GUARD_DASHBOARD_POLL_INTERVAL_SECONDS (15s),
   * well under the 300s default escalation window.
   */
  async getDashboard(scope: TenantScope, guardUserId: string): Promise<GuardDashboard> {
    const guard = await this.guardContext.resolveOrThrow(guardUserId);
    assertSocietyMatch(guard.societyId, scope);

    const escalatedJustNow = await this.visitApprovalService.checkAndEscalate(guard.societyId);

    const pendingVisits = await this.visits.find({
      where: { societyId: guard.societyId, status: 'pending' },
      order: { createdAt: 'ASC' },
    });

    const pendingDeliveries = await this.deliveries.find({
      where: { societyId: guard.societyId, status: 'pending' },
      order: { createdAt: 'ASC' },
    });

    const activeAlerts = await this.alerts.find({
      where: { societyId: guard.societyId, status: 'active' },
      order: { createdAt: 'DESC' },
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayCounts = guard.gateId
      ? await this.gateLogs
          .createQueryBuilder('log')
          .select('log.direction', 'direction')
          .addSelect('COUNT(*)', 'count')
          .where('log.gate_id = :gateId', { gateId: guard.gateId })
          .andWhere('log.occurred_at >= :todayStart', { todayStart })
          .groupBy('log.direction')
          .getRawMany<{ direction: 'in' | 'out'; count: string }>()
      : [];
    const todayEntries = Number(todayCounts.find((c) => c.direction === 'in')?.count ?? 0);
    const todayExits = Number(todayCounts.find((c) => c.direction === 'out')?.count ?? 0);

    return {
      gateId: guard.gateId ?? '',
      societyId: guard.societyId,
      pendingVisits,
      pendingDeliveries,
      escalatedJustNow,
      activeAlerts,
      todayEntries,
      todayExits,
    };
  }

  /**
   * "Log a call-initiated event only — no real VoIP" (session scope). No
   * dedicated call-log table exists (none was in this session's migration
   * scope) — the NotificationProvider stub's console log IS the record for
   * now; Module 19 would give this a real delivery + audit trail.
   */
  async callResident(
    dto: CallResidentDto,
    scope: TenantScope,
    guardUserId: string,
  ): Promise<{ called: boolean; recipientUserId: string | null; at: Date }> {
    const guard = await this.guardContext.resolveOrThrow(guardUserId);
    assertSocietyMatch(guard.societyId, scope);

    const flat = await this.flats.findOne({ where: { id: dto.flatId } });
    if (!flat || flat.societyId !== guard.societyId) throw new NotFoundException('Flat not found');

    const residents = await this.residents.find({ where: { flatId: flat.id, status: 'active' } });
    const primary = residents.find((r) => r.relationType === 'owner') ?? residents[0];
    const at = new Date();

    if (primary?.userId) {
      await this.notifications.send({
        recipientUserId: primary.userId,
        channel: 'push',
        event: 'guard.call_initiated',
        title: 'Gate is calling',
        body: 'The security guard is trying to reach you.',
        data: { flatId: flat.id, gateId: guard.gateId },
      });
    }

    return { called: !!primary?.userId, recipientUserId: primary?.userId ?? null, at };
  }

  /**
   * Computed on read rather than depending on a real "shift-end" cron
   * trigger that doesn't exist this session — upserts today's shift_reports
   * row with fresh counts each time it's requested, so the table stays
   * populated without needing a scheduler.
   */
  async getShiftReport(scope: TenantScope, guardUserId: string): Promise<ShiftReport> {
    const guard = await this.guardContext.resolveOrThrow(guardUserId);
    assertSocietyMatch(guard.societyId, scope);
    if (!guard.gateId) throw new NotFoundException('Guard has no gate assigned');

    const shiftDate = new Date().toISOString().slice(0, 10);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const counts = await this.gateLogs
      .createQueryBuilder('log')
      .select('log.direction', 'direction')
      .addSelect('COUNT(*)', 'count')
      .where('log.gate_id = :gateId AND log.guard_id = :guardId', { gateId: guard.gateId, guardId: guard.id })
      .andWhere('log.occurred_at >= :todayStart', { todayStart })
      .groupBy('log.direction')
      .getRawMany<{ direction: 'in' | 'out'; count: string }>();
    const entriesCount = Number(counts.find((c) => c.direction === 'in')?.count ?? 0);
    const exitsCount = Number(counts.find((c) => c.direction === 'out')?.count ?? 0);

    const alertsCount = await this.alerts.count({
      where: { societyId: guard.societyId },
    });

    let report = await this.shiftReports.findOne({
      where: { guardId: guard.id, gateId: guard.gateId, shiftDate },
    });
    if (!report) {
      report = this.shiftReports.create({
        societyId: guard.societyId,
        guardId: guard.id,
        gateId: guard.gateId,
        shiftDate,
      });
    }
    report.entriesCount = entriesCount;
    report.exitsCount = exitsCount;
    report.alertsCount = alertsCount;
    return this.shiftReports.save(report);
  }
}
