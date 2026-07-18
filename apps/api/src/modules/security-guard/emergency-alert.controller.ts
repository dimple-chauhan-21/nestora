import { Body, Controller, Param, Post } from '@nestjs/common';
import { EmergencyAlertService } from './emergency-alert.service';
import { RaiseEmergencyAlertDto } from './dto/raise-emergency-alert.dto';
import { ResolveEmergencyAlertDto } from './dto/resolve-emergency-alert.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller('emergency-alerts')
export class EmergencyAlertController {
  constructor(private readonly emergencyAlertService: EmergencyAlertService) {}

  @Post()
  @RequirePermission('emergency:raise')
  raise(
    @Body() dto: RaiseEmergencyAlertDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.emergencyAlertService.raise(dto, scope, user.userId);
  }

  @Post(':id/resolve')
  @RequirePermission('emergency:raise')
  resolve(
    @Param('id') id: string,
    @Body() dto: ResolveEmergencyAlertDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.emergencyAlertService.resolve(id, dto, scope, user.userId);
  }
}
