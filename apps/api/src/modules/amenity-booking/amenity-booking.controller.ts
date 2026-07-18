import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AmenityBookingService } from './amenity-booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateBookingRuleDto } from './dto/create-booking-rule.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller()
export class AmenityBookingController {
  constructor(private readonly amenityBookingService: AmenityBookingService) {}

  @Post('amenity-booking-rules')
  @RequirePermission('amenity-booking:manage')
  createRule(
    @Body() dto: CreateBookingRuleDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.amenityBookingService.createRule(dto, scope, user.userId);
  }

  @Get('amenities/:id/availability')
  @RequirePermission('amenity-booking:read')
  getAvailability(
    @Param('id') id: string,
    @Query('date') date: string,
    @CurrentTenantScope() scope: TenantScope,
  ) {
    if (!date) throw new BadRequestException('date query parameter is required (YYYY-MM-DD)');
    return this.amenityBookingService.getAvailability(id, date, scope);
  }

  @Post('amenities/:id/bookings')
  @RequirePermission('amenity-booking:book')
  createBooking(
    @Param('id') id: string,
    @Body() dto: CreateBookingDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // §11.1: idempotency key required for any endpoint that could plausibly
    // be retried by a flaky client — bookings are explicitly named. Stored
    // directly as amenity_bookings.idempotency_key (UNIQUE), same natural-
    // constraint idempotency pattern as everywhere else in this codebase,
    // not a generic response-cache.
    if (!idempotencyKey || !isUUID(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key header is required and must be a UUID');
    }
    return this.amenityBookingService.createBooking(id, dto, idempotencyKey, scope, user.userId);
  }

  @Delete('amenity-bookings/:id')
  @RequirePermission('amenity-booking:book')
  cancelBooking(@Param('id') id: string, @CurrentTenantScope() scope: TenantScope) {
    return this.amenityBookingService.cancelBooking(id, scope);
  }
}
