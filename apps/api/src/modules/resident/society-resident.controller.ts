import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { ResidentService } from './resident.service';
import { ResidentListQueryDto } from './dto/resident-list-query.dto';
import { PaginatedResidentResponseDto } from './dto/paginated-resident-response.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller('societies')
export class SocietyResidentController {
  constructor(private readonly residentService: ResidentService) {}

  @Get(':id/residents')
  @RequirePermission('resident:read')
  @ApiOkResponse({ type: PaginatedResidentResponseDto })
  listResidents(
    @Param('id') id: string,
    @CurrentTenantScope() scope: TenantScope,
    @Query() query: ResidentListQueryDto,
  ): Promise<PaginatedResidentResponseDto> {
    return this.residentService.listResidents(id, scope, query);
  }
}
