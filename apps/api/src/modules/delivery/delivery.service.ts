import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Delivery } from '../../database/entities/delivery.entity';
import { DeliveryAgent } from '../../database/entities/delivery-agent.entity';
import { Flat } from '../../database/entities/flat.entity';
import { Resident } from '../../database/entities/resident.entity';
import { User } from '../../database/entities/user.entity';
import { GuardContextService } from '../security-guard/guard-context.service';
import { GateService } from '../security-guard/gate.service';
import { assertGateMatch } from '../security-guard/gate-scope/gate-scope.util';
import { assertFlatMatch, assertSocietyMatch } from '../../common/tenant-scope/tenant-scope.util';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import { generateOtp, sha256Hex } from '../auth/util/hash.util';
import { CLOCK, type Clock } from '../../common/clock';
import { NOTIFICATION_PROVIDER, type NotificationProvider } from '../notification/notification-provider.interface';
import { SMS_PROVIDER, type SmsProvider } from '../auth/sms/sms-provider.interface';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { VerifyDeliveryOtpDto } from './dto/verify-delivery-otp.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';

/** §6's own explicit validation rule: OTP is 4-6 digits, 10-minute expiry. */
export const DELIVERY_OTP_TTL_SECONDS = 10 * 60;
export const DELIVERY_OTP_MAX_ATTEMPTS = 3;

/** Never includes otpHash — that value must never leave this service, not even to the guard who logged the delivery. */
export interface DeliveryView {
  id: string;
  societyId: string;
  flatId: string;
  agentId: string;
  gateId: string;
  guardId: string;
  platform: string | null;
  parcelPhotoUrl: string | null;
  status: string;
  otpVerified: boolean;
  heldAtDesk: boolean;
  handoverOverrideReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toView(delivery: Delivery): DeliveryView {
  return {
    id: delivery.id,
    societyId: delivery.societyId,
    flatId: delivery.flatId,
    agentId: delivery.agentId,
    gateId: delivery.gateId,
    guardId: delivery.guardId,
    platform: delivery.platform,
    parcelPhotoUrl: delivery.parcelPhotoUrl,
    status: delivery.status,
    otpVerified: delivery.otpVerifiedAt !== null,
    heldAtDesk: delivery.heldAtDesk,
    handoverOverrideReason: delivery.handoverOverrideReason,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
  };
}

@Injectable()
export class DeliveryService {
  constructor(
    @InjectRepository(Delivery) private readonly deliveries: Repository<Delivery>,
    @InjectRepository(DeliveryAgent) private readonly agents: Repository<DeliveryAgent>,
    @InjectRepository(Flat) private readonly flats: Repository<Flat>,
    @InjectRepository(Resident) private readonly residents: Repository<Resident>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly guardContext: GuardContextService,
    private readonly gateService: GateService,
    @Inject(NOTIFICATION_PROVIDER) private readonly notifications: NotificationProvider,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private async findOrCreateAgent(phone: string, name: string | undefined, platform: string | undefined): Promise<DeliveryAgent> {
    const existing = await this.agents.findOne({ where: { phone } });
    if (existing) return existing;
    return this.agents.save(this.agents.create({ phone, name: name ?? null, platform: platform ?? null }));
  }

  /**
   * "Guard logs agent + platform → resident notified" — the arrival event
   * is both a `deliveries` row AND a `gate_logs` row (§6 explicitly shares
   * `gate_logs` with Module 4/5, same as GateService.scan()'s own visitor
   * check-ins) — reuses GateService.writeGateLog rather than a second
   * INSERT path, so gate activity reporting never has to know deliveries
   * exist as a separate write.
   */
  async create(dto: CreateDeliveryDto, scope: TenantScope, guardUserId: string): Promise<DeliveryView> {
    const guard = await this.guardContext.resolveOrThrow(guardUserId);
    assertSocietyMatch(guard.societyId, scope);
    assertGateMatch(dto.gateId, guard.gateId);

    if (dto.idempotencyKey) {
      const existing = await this.deliveries.findOne({ where: { idempotencyKey: dto.idempotencyKey } });
      if (existing) return toView(existing);
    }

    const flat = await this.flats.findOne({ where: { id: dto.flatId } });
    if (!flat) throw new NotFoundException('Flat not found');
    if (flat.societyId !== guard.societyId) {
      throw new ForbiddenException("Not authorized for this flat's society");
    }

    const agent = await this.findOrCreateAgent(dto.agentPhone, dto.agentName, dto.platform);

    const otp = generateOtp();
    const now = this.clock.now();

    const delivery = await this.deliveries.save(
      this.deliveries.create({
        societyId: guard.societyId,
        flatId: flat.id,
        agentId: agent.id,
        gateId: dto.gateId,
        guardId: guard.id,
        platform: dto.platform ?? null,
        parcelPhotoUrl: dto.parcelPhotoUrl ?? null,
        status: 'pending',
        otpHash: sha256Hex(otp),
        otpExpiresAt: new Date(now.getTime() + DELIVERY_OTP_TTL_SECONDS * 1000),
        otpAttempts: 0,
        otpVerifiedAt: null,
        heldAtDesk: false,
        handoverOverrideReason: null,
        idempotencyKey: dto.idempotencyKey ?? null,
      }),
    );

    await this.gateService.writeGateLog({
      societyId: guard.societyId,
      gateId: dto.gateId,
      guardId: guard.id,
      entityType: 'delivery',
      visitorVisitId: null,
      direction: 'in',
      method: 'manual',
      overrideReason: null,
      idempotencyKey: dto.idempotencyKey ?? delivery.id,
      occurredAtClientReported: null,
    });

    await this.notifyResidents(flat, delivery, otp);

    return toView(delivery);
  }

  /**
   * §6's Security note, verbatim: "OTP delivered via push+SMS to resident
   * only, never shown to the guard directly." A notification failure here
   * never fails the delivery log itself, which has already committed —
   * same posture as every other notification call site in this codebase.
   */
  private async notifyResidents(flat: Flat, delivery: Delivery, otp: string): Promise<void> {
    const activeResidents = await this.residents.find({ where: { flatId: flat.id, status: 'active' } });
    const platformLabel = delivery.platform ?? 'delivery';

    for (const resident of activeResidents) {
      if (!resident.userId) continue;
      try {
        await this.notifications.send({
          recipientUserId: resident.userId,
          channel: 'push',
          event: 'delivery.arrived',
          title: 'Your delivery has arrived',
          body: `A ${platformLabel} agent is at the gate. Share this code with the guard to confirm handover: ${otp}`,
          data: { deliveryId: delivery.id, flatId: flat.id },
        });
      } catch {
        // Logged inside the provider itself — never block the delivery flow.
      }
    }

    // SMS fallback channel, per §6 — best-effort per resident. Phone lives
    // on `users`, not `residents` (same lookup shape as auth/OTP), so each
    // resident's user record is fetched individually rather than assumed.
    for (const resident of activeResidents) {
      if (!resident.userId) continue;
      const user = await this.users.findOne({ where: { id: resident.userId } });
      if (!user?.phone) continue;
      try {
        await this.smsProvider.send(
          user.phone,
          `Your Nestora delivery handover code is ${otp}. Valid ${DELIVERY_OTP_TTL_SECONDS / 60} minutes. Share only with the guard.`,
        );
      } catch {
        // Same posture — SMS failure never blocks the delivery flow.
      }
    }
  }

  private async loadDeliveryOrThrow(deliveryId: string): Promise<Delivery> {
    const delivery = await this.deliveries.findOne({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return delivery;
  }

  /**
   * Returns only a boolean — never the code, never *why* it failed
   * (expired vs. wrong vs. locked all look the same to the guard) — §6's
   * "guard sees verified/not-verified boolean, not the code" applies to
   * the failure reason too, not just the code itself.
   */
  async verifyOtp(deliveryId: string, dto: VerifyDeliveryOtpDto, scope: TenantScope, guardUserId: string): Promise<{ verified: boolean }> {
    const guard = await this.guardContext.resolveOrThrow(guardUserId);
    assertSocietyMatch(guard.societyId, scope);

    const delivery = await this.loadDeliveryOrThrow(deliveryId);
    assertSocietyMatch(delivery.societyId, scope);

    if (delivery.otpVerifiedAt) return { verified: true }; // already verified — idempotent

    if (delivery.otpAttempts >= DELIVERY_OTP_MAX_ATTEMPTS) return { verified: false };

    const now = this.clock.now();
    if (delivery.otpExpiresAt.getTime() < now.getTime()) {
      return { verified: false };
    }

    if (sha256Hex(dto.otp) !== delivery.otpHash) {
      await this.deliveries.update(delivery.id, { otpAttempts: delivery.otpAttempts + 1 });
      return { verified: false };
    }

    await this.deliveries.update(delivery.id, { otpVerifiedAt: now });
    return { verified: true };
  }

  /**
   * `handed_over` requires either a prior successful OTP verification or an
   * explicit override reason (elderly/no-smartphone residents, §6) — never
   * both silently accepted without one or the other, and never a client
   * that can just skip straight to `handed_over` with no evidence at all.
   */
  async updateStatus(deliveryId: string, dto: UpdateDeliveryStatusDto, scope: TenantScope, guardUserId: string): Promise<DeliveryView> {
    const guard = await this.guardContext.resolveOrThrow(guardUserId);
    assertSocietyMatch(guard.societyId, scope);

    const delivery = await this.loadDeliveryOrThrow(deliveryId);
    assertSocietyMatch(delivery.societyId, scope);

    if (dto.status === 'handed_over') {
      if (!delivery.otpVerifiedAt) {
        if (!dto.overrideReason?.trim()) {
          throw new BadRequestException(
            'Cannot mark handed_over without a verified OTP or an explicit overrideReason',
          );
        }
        delivery.handoverOverrideReason = dto.overrideReason.trim();
      }
      delivery.status = 'handed_over';
    } else if (dto.status === 'returned') {
      delivery.status = 'returned';
    }

    if (dto.heldAtDesk !== undefined) {
      delivery.heldAtDesk = dto.heldAtDesk;
    }

    const saved = await this.deliveries.save(delivery);
    return toView(saved);
  }

  async listForFlat(flatId: string, status: string | undefined, scope: TenantScope): Promise<DeliveryView[]> {
    const flat = await this.flats.findOne({ where: { id: flatId } });
    if (!flat) throw new NotFoundException('Flat not found');
    assertSocietyMatch(flat.societyId, scope);
    assertFlatMatch(flat.id, scope);

    const where: Record<string, unknown> = { flatId: flat.id };
    if (status) where.status = status;

    const rows = await this.deliveries.find({ where, order: { createdAt: 'DESC' } });
    return rows.map(toView);
  }
}
