import { Body, Controller, Post } from '@nestjs/common';
import { BillingPlanService } from './billing-plan.service';
import { CreateBillingPlanDto } from './dto/create-billing-plan.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller('billing-plans')
export class BillingPlanController {
  constructor(private readonly billingPlanService: BillingPlanService) {}

  @Post()
  @RequirePermission('billing:manage')
  create(
    @Body() dto: CreateBillingPlanDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billingPlanService.create(dto.societyId, dto, scope, user.userId);
  }
}
