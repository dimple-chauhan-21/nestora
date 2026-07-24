import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { VisitApprovalService } from './visit-approval.service';
import { VisitHistoryQueryDto } from './dto/visit-history-query.dto';
import { PaginatedVisitResponseDto } from './dto/paginated-visit-response.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller('flats')
export class FlatVisitController {
  constructor(private readonly visitApprovalService: VisitApprovalService) {}

  @Get(':id/visits/history')
  @RequirePermission('visitor:read')
  @ApiOkResponse({ type: PaginatedVisitResponseDto })
  history(
    @Param('id') id: string,
    @Query() query: VisitHistoryQueryDto,
    @CurrentTenantScope() scope: TenantScope,
  ): Promise<PaginatedVisitResponseDto> {
    return this.visitApprovalService.history(id, scope, query);
  }
}
