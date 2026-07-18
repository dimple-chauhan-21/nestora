import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GuestInvite } from '../../database/entities/guest-invite.entity';
import { Flat } from '../../database/entities/flat.entity';
import { Resident } from '../../database/entities/resident.entity';
import { QrTokenService } from './qr/qr-token.service';
import { CLOCK, type Clock } from '../../common/clock';
import { assertFlatMatch, assertSocietyMatch } from '../../common/tenant-scope/tenant-scope.util';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import { CreateGuestInviteDto } from './dto/create-guest-invite.dto';

@Injectable()
export class GuestInviteService {
  constructor(
    @InjectRepository(GuestInvite) private readonly invites: Repository<GuestInvite>,
    @InjectRepository(Flat) private readonly flats: Repository<Flat>,
    @InjectRepository(Resident) private readonly residents: Repository<Resident>,
    private readonly qrTokenService: QrTokenService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(
    flatId: string,
    callerUserId: string,
    dto: CreateGuestInviteDto,
    scope: TenantScope,
  ): Promise<GuestInvite> {
    const flat = await this.flats.findOne({ where: { id: flatId } });
    if (!flat) throw new NotFoundException('Flat not found');
    assertSocietyMatch(flat.societyId, scope);
    assertFlatMatch(flat.id, scope);

    // Resolved from the caller's own resident record for this flat — never
    // trust a client-supplied residentId for "who is inviting this guest".
    const resident = await this.residents.findOne({
      where: { flatId: flat.id, userId: callerUserId, status: 'active' },
    });
    if (!resident) {
      throw new BadRequestException('Caller is not an active resident of this flat');
    }

    const validFrom = new Date(dto.validFrom);
    const validTo = new Date(dto.validTo);
    if (validTo <= validFrom) {
      throw new BadRequestException('validTo must be after validFrom');
    }

    const invite = this.invites.create({
      societyId: flat.societyId,
      flatId: flat.id,
      createdByResidentId: resident.id,
      guestName: dto.guestName,
      guestPhone: dto.guestPhone ?? null,
      validFrom,
      validTo,
      recurrenceRule: dto.recurrenceRule ?? null,
      qrToken: 'pending', // placeholder, replaced below once we have the id
    });
    await this.invites.save(invite);

    const expiresInSeconds = Math.max(1, Math.floor((validTo.getTime() - this.clock.now().getTime()) / 1000));
    invite.qrToken = this.qrTokenService.sign({ sub: invite.id, purpose: 'guest_invite' }, expiresInSeconds);
    await this.invites.save(invite);

    return invite;
  }

  /**
   * Public resolve — validates the token and returns the invite's details
   * without consuming it. Actual single-use consumption happens at gate
   * check-in time (GateService), not here — this endpoint is read-only so a
   * guard's scanner (or the visitor's own app) can preview/validate before
   * arrival.
   */
  async resolveByToken(token: string): Promise<GuestInvite> {
    const payload = this.qrTokenService.verify(token);
    if (payload.purpose !== 'guest_invite') {
      throw new BadRequestException('Not a guest-invite token');
    }

    const invite = await this.invites.findOne({ where: { id: payload.sub } });
    if (!invite || invite.deletedAt) throw new NotFoundException('Invite not found');

    const now = this.clock.now();
    if (now < invite.validFrom || now > invite.validTo) {
      throw new BadRequestException('Invite is outside its valid window');
    }
    if (!invite.recurrenceRule && invite.consumedAt) {
      throw new BadRequestException('Invite has already been used');
    }

    return invite;
  }

  /** Called by GateService at actual check-in. Marks single-use invites consumed; recurring invites are re-validated per occurrence but never marked consumed. */
  async consume(inviteId: string): Promise<void> {
    const invite = await this.invites.findOne({ where: { id: inviteId } });
    if (!invite) throw new NotFoundException('Invite not found');
    if (!invite.recurrenceRule) {
      invite.consumedAt = this.clock.now();
      await this.invites.save(invite);
    }
  }
}
