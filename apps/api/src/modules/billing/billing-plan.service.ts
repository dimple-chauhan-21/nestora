import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingPlan } from '../../database/entities/billing-plan.entity';
import { assertSocietyMatch } from '../../common/tenant-scope/tenant-scope.util';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import { CreateBillingPlanDto } from './dto/create-billing-plan.dto';

@Injectable()
export class BillingPlanService {
  constructor(
    @InjectRepository(BillingPlan) private readonly billingPlans: Repository<BillingPlan>,
  ) {}

  async create(
    societyId: string,
    dto: CreateBillingPlanDto,
    scope: TenantScope,
    actorId: string,
  ): Promise<BillingPlan> {
    assertSocietyMatch(societyId, scope);

    const plan = this.billingPlans.create({
      societyId,
      formulaType: dto.formulaType,
      rate: String(dto.rate),
      lateFeePct: String(dto.lateFeePct),
      gracePeriodDays: dto.gracePeriodDays,
      createdBy: actorId,
      updatedBy: actorId,
    });
    return this.billingPlans.save(plan);
  }

  async getActiveForSociety(societyId: string): Promise<BillingPlan> {
    const plan = await this.billingPlans.findOne({
      where: { societyId },
      order: { createdAt: 'DESC' },
    });
    if (!plan) throw new NotFoundException('No billing plan configured for this society');
    return plan;
  }
}
