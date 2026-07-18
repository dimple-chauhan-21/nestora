import { Controller, Get, Param, Query } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller('flats')
export class FlatDeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get(':id/deliveries')
  @RequirePermission('delivery:read')
  list(
    @Param('id') id: string,
    @CurrentTenantScope() scope: TenantScope,
    @Query('status') status?: string,
  ) {
    return this.deliveryService.listForFlat(id, status, scope);
  }
}
