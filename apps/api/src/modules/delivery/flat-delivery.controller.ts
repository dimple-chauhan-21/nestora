import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { DeliveryService } from './delivery.service';
import { DeliveryResponseDto } from './dto/delivery-response.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller('flats')
export class FlatDeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get(':id/deliveries')
  @RequirePermission('delivery:read')
  @ApiOkResponse({ type: [DeliveryResponseDto] })
  list(
    @Param('id') id: string,
    @CurrentTenantScope() scope: TenantScope,
    @Query('status') status?: string,
  ): Promise<DeliveryResponseDto[]> {
    return this.deliveryService.listForFlat(id, status, scope);
  }
}
