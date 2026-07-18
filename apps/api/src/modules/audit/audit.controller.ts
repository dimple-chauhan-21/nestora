import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermission('audit:read')
  list(
    @CurrentTenantScope() scope: TenantScope,
    @Query('entity_type') entityType?: string,
    @Query('entity_id') entityId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.auditService.list(
      {
        ...(entityType && { entityType }),
        ...(entityId && { entityId }),
        ...(from && { from: new Date(from) }),
        ...(to && { to: new Date(to) }),
      },
      scope,
    );
  }

  @Get('export')
  @RequirePermission('audit:read')
  export(
    @CurrentTenantScope() scope: TenantScope,
    @Query('entity_type') entityType?: string,
    @Query('entity_id') entityId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.auditService.export(
      {
        ...(entityType && { entityType }),
        ...(entityId && { entityId }),
        ...(from && { from: new Date(from) }),
        ...(to && { to: new Date(to) }),
      },
      scope,
    );
  }
}
