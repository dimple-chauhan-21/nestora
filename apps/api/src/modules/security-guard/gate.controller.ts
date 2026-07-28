import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse } from '@nestjs/swagger';
import { GateService } from './gate.service';
import { GateScanDto } from './dto/gate-scan.dto';
import { GateManualEntryDto } from './dto/gate-manual-entry.dto';
import { GateLogResponseDto } from './dto/gate-log-response.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller('gate')
export class GateController {
  constructor(private readonly gateService: GateService) {}

  @Post('scan')
  @RequirePermission('gate:scan')
  @ApiCreatedResponse({ type: GateLogResponseDto })
  scan(
    @Body() dto: GateScanDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.gateService.scan(dto, scope, user.userId);
  }

  @Post('manual-entry')
  @RequirePermission('gate:checkin')
  @ApiCreatedResponse({ type: GateLogResponseDto })
  manualEntry(
    @Body() dto: GateManualEntryDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.gateService.manualEntry(dto, scope, user.userId);
  }
}
