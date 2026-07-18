import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { VerifyDeliveryOtpDto } from './dto/verify-delivery-otp.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller('deliveries')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Post()
  @RequirePermission('delivery:manage')
  create(
    @Body() dto: CreateDeliveryDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deliveryService.create(dto, scope, user.userId);
  }

  @Post(':id/otp/verify')
  @RequirePermission('delivery:manage')
  verifyOtp(
    @Param('id') id: string,
    @Body() dto: VerifyDeliveryOtpDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deliveryService.verifyOtp(id, dto, scope, user.userId);
  }

  @Patch(':id/status')
  @RequirePermission('delivery:manage')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryStatusDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deliveryService.updateStatus(id, dto, scope, user.userId);
  }
}
