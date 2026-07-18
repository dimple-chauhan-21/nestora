import { Body, Controller, Param, Post } from '@nestjs/common';
import { VisitApprovalService } from './visit-approval.service';
import { CreateWalkInDto } from './dto/create-walk-in.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller('visits')
export class VisitController {
  constructor(private readonly visitApprovalService: VisitApprovalService) {}

  @Post('walk-in')
  @RequirePermission('visitor:manage')
  createWalkIn(
    @Body() dto: CreateWalkInDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.visitApprovalService.createWalkIn(dto.flatId, dto, scope, user.userId);
  }

  @Post(':id/approve')
  @RequirePermission('visitor:approve')
  approve(
    @Param('id') id: string,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.visitApprovalService.approve(id, scope, user.userId);
  }

  @Post(':id/reject')
  @RequirePermission('visitor:approve')
  reject(
    @Param('id') id: string,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.visitApprovalService.reject(id, scope, user.userId);
  }
}
