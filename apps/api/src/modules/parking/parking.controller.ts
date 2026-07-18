import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ParkingService } from './parking.service';
import { CreateParkingSlotDto } from './dto/create-parking-slot.dto';
import { CreateAllocationDto } from './dto/create-allocation.dto';
import { CreateViolationDto } from './dto/create-violation.dto';
import { ResolveViolationDto } from './dto/resolve-violation.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller()
export class ParkingController {
  constructor(private readonly parkingService: ParkingService) {}

  @Post('parking/slots')
  @RequirePermission('parking:manage')
  createSlot(
    @Body() dto: CreateParkingSlotDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.parkingService.createSlot(dto, scope, user.userId);
  }

  @Post('parking/allocations')
  @RequirePermission('parking:manage')
  createAllocation(
    @Body() dto: CreateAllocationDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.parkingService.createAllocation(dto, scope, user.userId);
  }

  @Patch('parking/allocations/:id/end')
  @RequirePermission('parking:manage')
  endAllocation(
    @Param('id') id: string,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.parkingService.endAllocation(id, scope, user.userId);
  }

  @Get('societies/:id/parking/availability')
  @RequirePermission('parking:read')
  getAvailability(@Param('id') id: string, @CurrentTenantScope() scope: TenantScope) {
    return this.parkingService.getAvailability(id, scope);
  }

  @Post('parking/violations')
  @RequirePermission('parking:read')
  reportViolation(
    @Body() dto: CreateViolationDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.parkingService.reportViolation(dto, scope, user.userId);
  }

  @Patch('parking/violations/:id/resolve')
  @RequirePermission('parking:manage')
  resolveViolation(
    @Param('id') id: string,
    @Body() dto: ResolveViolationDto,
    @CurrentTenantScope() scope: TenantScope,
  ) {
    return this.parkingService.resolveViolation(id, dto, scope);
  }
}
