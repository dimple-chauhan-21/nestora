import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { CreateMaintenanceLogDto } from './dto/create-maintenance-log.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('assets')
  @RequirePermission('inventory:manage')
  createAsset(
    @Body() dto: CreateAssetDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.createAsset(dto, scope, user.userId);
  }

  @Post('assets/:id/maintenance-log')
  @RequirePermission('inventory:manage')
  createMaintenanceLog(
    @Param('id') id: string,
    @Body() dto: CreateMaintenanceLogDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.createMaintenanceLog(id, dto, scope, user.userId);
  }

  @Get('societies/:id/assets')
  @RequirePermission('inventory:read')
  listForSociety(
    @Param('id') id: string,
    @Query('category') category: string | undefined,
    @CurrentTenantScope() scope: TenantScope,
  ) {
    return this.inventoryService.listForSociety(id, category, scope);
  }

  @Get('assets/:id/warranty-alerts')
  @RequirePermission('inventory:read')
  getWarrantyAlert(@Param('id') id: string, @CurrentTenantScope() scope: TenantScope) {
    return this.inventoryService.getWarrantyAlert(id, scope);
  }
}
