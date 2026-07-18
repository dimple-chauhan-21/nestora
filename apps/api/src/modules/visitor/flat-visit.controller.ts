import { Controller, Get, Param } from '@nestjs/common';
import { VisitApprovalService } from './visit-approval.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller('flats')
export class FlatVisitController {
  constructor(private readonly visitApprovalService: VisitApprovalService) {}

  @Get(':id/visits/history')
  @RequirePermission('visitor:read')
  history(@Param('id') id: string, @CurrentTenantScope() scope: TenantScope) {
    return this.visitApprovalService.history(id, scope);
  }
}
