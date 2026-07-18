import { Controller, Get, Query } from '@nestjs/common';
import { FinancialReportService } from './financial-report.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller('reports')
export class FinancialReportController {
  constructor(private readonly financialReportService: FinancialReportService) {}

  @Get('financial-summary')
  @RequirePermission('billing:read')
  getFinancialSummary(@CurrentTenantScope() scope: TenantScope, @Query('societyId') societyId?: string) {
    return this.financialReportService.getFinancialSummary(scope, societyId);
  }
}
