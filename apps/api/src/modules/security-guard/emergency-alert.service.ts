import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmergencyAlert } from '../../database/entities/emergency-alert.entity';
import { GuardContextService } from './guard-context.service';
import { assertSocietyMatch } from '../../common/tenant-scope/tenant-scope.util';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import { RaiseEmergencyAlertDto } from './dto/raise-emergency-alert.dto';
import { ResolveEmergencyAlertDto } from './dto/resolve-emergency-alert.dto';

@Injectable()
export class EmergencyAlertService {
  constructor(
    @InjectRepository(EmergencyAlert) private readonly alerts: Repository<EmergencyAlert>,
    private readonly guardContext: GuardContextService,
  ) {}

  async raise(dto: RaiseEmergencyAlertDto, scope: TenantScope, raisedByUserId: string): Promise<EmergencyAlert> {
    const guard = await this.guardContext.resolveOrThrow(raisedByUserId);
    assertSocietyMatch(guard.societyId, scope);

    const alert = this.alerts.create({
      societyId: guard.societyId,
      raisedBy: raisedByUserId,
      type: dto.type,
      status: 'active',
    });
    return this.alerts.save(alert);
  }

  /**
   * §5 validation: cannot be dismissed/resolved without a resolution_note —
   * enforced here (DTO requires it, non-empty) AND by the DB CHECK
   * constraint (chk_emergency_alert_resolution) as defense-in-depth, so a
   * bug in this service layer alone can't silently violate the rule.
   */
  async resolve(
    alertId: string,
    dto: ResolveEmergencyAlertDto,
    scope: TenantScope,
    resolverId: string,
  ): Promise<EmergencyAlert> {
    const alert = await this.alerts.findOne({ where: { id: alertId } });
    if (!alert) throw new NotFoundException('Alert not found');
    assertSocietyMatch(alert.societyId, scope);

    if (alert.status === 'resolved') {
      throw new BadRequestException('Alert is already resolved');
    }
    if (!dto.resolutionNote || dto.resolutionNote.trim().length === 0) {
      throw new BadRequestException('resolutionNote is required to resolve an alert');
    }

    alert.status = 'resolved';
    alert.resolutionNote = dto.resolutionNote;
    alert.resolvedBy = resolverId;
    alert.resolvedAt = new Date();
    return this.alerts.save(alert);
  }
}
