import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { BillService } from './bill.service';
import { PaymentService } from './payment.service';
import { GenerateBillsDto } from './dto/generate-bills.dto';
import { RecordOfflinePaymentDto } from './dto/record-offline-payment.dto';
import { BillResponseDto } from './dto/bill-response.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { PaymentSessionResponseDto } from './dto/payment-session-response.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller()
export class BillController {
  constructor(
    private readonly billService: BillService,
    private readonly paymentService: PaymentService,
  ) {}

  @Post('bills/generate')
  @RequirePermission('billing:manage')
  generate(
    @Body() dto: GenerateBillsDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billService.generateForSociety(dto.societyId, dto.billingPeriod, scope, user.userId);
  }

  @Get('flats/:id/bills')
  @RequirePermission('billing:read')
  @ApiOkResponse({ type: [BillResponseDto] })
  listForFlat(@Param('id') id: string, @CurrentTenantScope() scope: TenantScope): Promise<BillResponseDto[]> {
    return this.billService.listForFlat(id, scope);
  }

  @Get('flats/:id/payments')
  @RequirePermission('billing:read')
  @ApiOkResponse({ type: [PaymentResponseDto] })
  listPaymentsForFlat(
    @Param('id') id: string,
    @CurrentTenantScope() scope: TenantScope,
  ): Promise<PaymentResponseDto[]> {
    return this.paymentService.listForFlat(id, scope);
  }

  @Post('bills/:id/pay')
  @RequirePermission('billing:pay')
  @ApiCreatedResponse({ type: PaymentSessionResponseDto })
  pay(
    @Param('id') id: string,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaymentSessionResponseDto> {
    return this.paymentService.initiatePayment(id, scope, user.userId);
  }

  @Post('bills/:id/record-offline-payment')
  @RequirePermission('billing:manage')
  @ApiCreatedResponse({ type: PaymentResponseDto })
  recordOfflinePayment(
    @Param('id') id: string,
    @Body() dto: RecordOfflinePaymentDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.recordOfflinePayment(id, dto, scope, user.userId);
  }
}
