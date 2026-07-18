import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VisitorVisit } from '../../database/entities/visitor-visit.entity';
import { Visitor } from '../../database/entities/visitor.entity';
import { Resident } from '../../database/entities/resident.entity';
import { Flat } from '../../database/entities/flat.entity';
import { BlacklistService } from './blacklist.service';
import { QrTokenService } from './qr/qr-token.service';
import { NOTIFICATION_PROVIDER, type NotificationProvider } from '../notification/notification-provider.interface';
import { CLOCK, type Clock } from '../../common/clock';
import { assertFlatMatch, assertSocietyMatch } from '../../common/tenant-scope/tenant-scope.util';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import { CreateWalkInDto } from './dto/create-walk-in.dto';
import {
  DEFAULT_ESCALATION_WINDOW_SECONDS,
  DEFAULT_PASS_VALIDITY_HOURS,
} from './visitor.constants';

@Injectable()
export class VisitApprovalService {
  constructor(
    @InjectRepository(VisitorVisit) private readonly visits: Repository<VisitorVisit>,
    @InjectRepository(Visitor) private readonly visitors: Repository<Visitor>,
    @InjectRepository(Resident) private readonly residents: Repository<Resident>,
    @InjectRepository(Flat) private readonly flats: Repository<Flat>,
    private readonly blacklistService: BlacklistService,
    private readonly qrTokenService: QrTokenService,
    @Inject(NOTIFICATION_PROVIDER) private readonly notifications: NotificationProvider,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private async loadFlatOrThrow(flatId: string): Promise<Flat> {
    const flat = await this.flats.findOne({ where: { id: flatId } });
    if (!flat) throw new NotFoundException('Flat not found');
    return flat;
  }

  private async residentsForFlat(flatId: string): Promise<Resident[]> {
    return this.residents.find({ where: { flatId, status: 'active' } });
  }

  async createWalkIn(
    flatId: string,
    dto: CreateWalkInDto,
    scope: TenantScope,
    _guardId: string,
  ): Promise<VisitorVisit> {
    const flat = await this.loadFlatOrThrow(flatId);
    assertSocietyMatch(flat.societyId, scope);

    await this.blacklistService.assertNotBlacklisted(flat.societyId, {
      phone: dto.phone ?? null,
      name: dto.name ?? null,
      idProofNumber: dto.idProofNumber ?? null,
    });

    let visitor = dto.phone ? await this.visitors.findOne({ where: { phone: dto.phone } }) : null;
    if (!visitor) {
      visitor = this.visitors.create({
        phone: dto.phone ?? null,
        name: dto.name ?? null,
        photoUrl: dto.photoUrl ?? null,
        idProofType: dto.idProofType ?? null,
        idProofNumber: dto.idProofNumber ?? null,
      });
      await this.visitors.save(visitor);
    }

    const visit = this.visits.create({
      societyId: flat.societyId,
      visitorId: visitor.id,
      flatId: flat.id,
      visitType: 'walk_in',
      purpose: dto.purpose ?? null,
      status: 'pending',
    });
    await this.visits.save(visit);

    const residents = await this.residentsForFlat(flat.id);
    const primary = residents.find((r) => r.relationType === 'owner') ?? residents[0];
    if (primary?.userId) {
      await this.notifications.send({
        recipientUserId: primary.userId,
        channel: 'push',
        event: 'visitor.arrived',
        title: 'Visitor at the gate',
        body: `${visitor.name ?? visitor.phone ?? 'A visitor'} is waiting for approval${
          dto.purpose ? ` (${dto.purpose})` : ''
        }.`,
        data: { visitId: visit.id, visitorName: visitor.name, visitorPhone: visitor.phone },
      });
    }

    return visit;
  }

  private async loadVisitOrThrow(visitId: string): Promise<VisitorVisit> {
    const visit = await this.visits.findOne({ where: { id: visitId } });
    if (!visit) throw new NotFoundException('Visit not found');
    return visit;
  }

  private async assertCanActOnVisit(visit: VisitorVisit, scope: TenantScope): Promise<void> {
    assertSocietyMatch(visit.societyId, scope);
    // A flat-pinned role (Owner/Tenant) may only act on their own flat's
    // visits; a society-wide role (Admin/Manager/Committee) may act on any
    // visit in their society — the SRS's "society office fallback approver"
    // edge case.
    assertFlatMatch(visit.flatId, scope);
  }

  async approve(visitId: string, scope: TenantScope, approverId: string): Promise<VisitorVisit> {
    const visit = await this.loadVisitOrThrow(visitId);
    await this.assertCanActOnVisit(visit, scope);

    if (visit.status !== 'pending') {
      throw new BadRequestException(`Cannot approve a visit with status "${visit.status}"`);
    }

    const visitor = await this.visitors.findOneOrFail({ where: { id: visit.visitorId } });
    // Re-check: a blacklist entry could have been added between walk-in and
    // approval — the pass must never be issued regardless of approval intent.
    await this.blacklistService.assertNotBlacklisted(visit.societyId, {
      phone: visitor.phone,
      name: visitor.name,
      idProofNumber: visitor.idProofNumber,
    });

    const now = this.clock.now();
    const validTo = new Date(now.getTime() + DEFAULT_PASS_VALIDITY_HOURS * 60 * 60 * 1000);
    const qrToken = this.qrTokenService.sign(
      { sub: visit.id, purpose: 'visitor_visit' },
      DEFAULT_PASS_VALIDITY_HOURS * 60 * 60,
    );

    visit.status = 'approved';
    visit.qrCode = qrToken;
    visit.validFrom = now;
    visit.validTo = validTo;
    visit.approvedBy = approverId;
    visit.approvedAt = now;
    await this.visits.save(visit);

    return visit;
  }

  async reject(visitId: string, scope: TenantScope, _rejecterId: string): Promise<VisitorVisit> {
    const visit = await this.loadVisitOrThrow(visitId);
    await this.assertCanActOnVisit(visit, scope);

    if (visit.status !== 'pending') {
      throw new BadRequestException(`Cannot reject a visit with status "${visit.status}"`);
    }

    visit.status = 'rejected';
    await this.visits.save(visit);
    return visit;
  }

  /**
   * The real trigger in the running app: GET /guard/dashboard calls this on
   * every hit (GuardService.getDashboard). Sweeps this society's pending,
   * not-yet-escalated visits past the timeout and pings a second contact.
   * Idempotent per visit (escalated_at gates re-notification).
   */
  async checkAndEscalate(
    societyId: string,
    windowSeconds: number = DEFAULT_ESCALATION_WINDOW_SECONDS,
  ): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - windowSeconds * 1000);

    const overdue = await this.visits
      .createQueryBuilder('visit')
      .where('visit.society_id = :societyId', { societyId })
      .andWhere('visit.status = :status', { status: 'pending' })
      .andWhere('visit.escalated_at IS NULL')
      .andWhere('visit.created_at < :cutoff', { cutoff })
      .getMany();

    let escalated = 0;
    for (const visit of overdue) {
      const residents = await this.residentsForFlat(visit.flatId);
      const primary = residents.find((r) => r.relationType === 'owner') ?? residents[0];
      const secondary = residents.find((r) => r.id !== primary?.id && r.userId);

      visit.escalatedAt = this.clock.now();
      await this.visits.save(visit);
      escalated++;

      if (secondary?.userId) {
        const visitor = await this.visitors.findOne({ where: { id: visit.visitorId } });
        await this.notifications.send({
          recipientUserId: secondary.userId,
          channel: 'push',
          event: 'visitor.escalated',
          title: 'Visitor approval needed (escalated)',
          body: `${visitor?.name ?? visitor?.phone ?? 'A visitor'} has been waiting over ${Math.round(
            windowSeconds / 60,
          )} min — the primary contact didn't respond.`,
          data: { visitId: visit.id },
        });
      }
      // No secondary contact reachable: per §4's edge case this falls to the
      // guard's own judgment call (override_reason on the gate log) — no
      // further automated escalation this session.
    }

    return escalated;
  }

  async history(flatId: string, scope: TenantScope): Promise<VisitorVisit[]> {
    const flat = await this.loadFlatOrThrow(flatId);
    assertSocietyMatch(flat.societyId, scope);
    assertFlatMatch(flat.id, scope);

    return this.visits.find({
      where: { flatId: flat.id },
      order: { createdAt: 'DESC' },
    });
  }
}
