import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { DeliveryService } from './delivery.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { VerifyDeliveryOtpDto } from './dto/verify-delivery-otp.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { DeliveryResponseDto } from './dto/delivery-response.dto';
import { VerifyDeliveryOtpResponseDto } from './dto/verify-delivery-otp-response.dto';
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
  @ApiCreatedResponse({ type: DeliveryResponseDto })
  create(
    @Body() dto: CreateDeliveryDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DeliveryResponseDto> {
    return this.deliveryService.create(dto, scope, user.userId);
  }

  @Post(':id/otp/verify')
  @RequirePermission('delivery:manage')
  @ApiCreatedResponse({ type: VerifyDeliveryOtpResponseDto })
  verifyOtp(
    @Param('id') id: string,
    @Body() dto: VerifyDeliveryOtpDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VerifyDeliveryOtpResponseDto> {
    return this.deliveryService.verifyOtp(id, dto, scope, user.userId);
  }

  @Patch(':id/status')
  @RequirePermission('delivery:manage')
  @ApiOkResponse({ type: DeliveryResponseDto })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryStatusDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DeliveryResponseDto> {
    return this.deliveryService.updateStatus(id, dto, scope, user.userId);
  }
}
