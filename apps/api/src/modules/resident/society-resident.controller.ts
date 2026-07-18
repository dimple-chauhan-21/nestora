import { Controller, Get, Param, Query } from '@nestjs/common';
import { ResidentService } from './resident.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller('societies')
export class SocietyResidentController {
  constructor(private readonly residentService: ResidentService) {}

  @Get(':id/residents')
  @RequirePermission('resident:read')
  listResidents(
    @Param('id') id: string,
    @CurrentTenantScope() scope: TenantScope,
    @Query('filter') filter?: string,
  ) {
    return this.residentService.listResidents(id, scope, filter);
  }
}
