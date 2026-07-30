import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { FinancialReportService } from './financial-report.service';
import { FinancialSummaryResponseDto } from './dto/financial-summary-response.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller('reports')
export class FinancialReportController {
  constructor(private readonly financialReportService: FinancialReportService) {}

  @Get('financial-summary')
  @RequirePermission('billing:read')
  @ApiOkResponse({ type: FinancialSummaryResponseDto })
  getFinancialSummary(
    @CurrentTenantScope() scope: TenantScope,
    @Query('societyId') societyId?: string,
  ): Promise<FinancialSummaryResponseDto> {
    return this.financialReportService.getFinancialSummary(scope, societyId);
  }
}
