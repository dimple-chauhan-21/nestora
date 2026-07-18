import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { DomesticStaffService } from './domestic-staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { CreateFlatMappingDto } from './dto/create-flat-mapping.dto';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { SetPoliceVerificationDocumentDto } from './dto/set-police-verification-document.dto';
import { SetPoliceVerificationStatusDto } from './dto/set-police-verification-status.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller()
export class DomesticStaffController {
  constructor(private readonly domesticStaffService: DomesticStaffService) {}

  @Post('staff')
  @RequirePermission('domestic-staff:manage')
  createStaff(@Body() dto: CreateStaffDto) {
    return this.domesticStaffService.createOrFindStaff(dto);
  }

  @Post('staff/:id/flat-mapping')
  @RequirePermission('domestic-staff:manage')
  createFlatMapping(
    @Param('id') id: string,
    @Body() dto: CreateFlatMappingDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.domesticStaffService.createFlatMapping(id, dto, scope, user.userId);
  }

  @Patch('staff/flat-mapping/:mappingId/deactivate')
  @RequirePermission('domestic-staff:manage')
  deactivateFlatMapping(
    @Param('mappingId') mappingId: string,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.domesticStaffService.deactivateFlatMapping(mappingId, scope, user.userId);
  }

  @Get('flats/:id/staff')
  @RequirePermission('domestic-staff:read')
  listForFlat(@Param('id') id: string, @CurrentTenantScope() scope: TenantScope) {
    return this.domesticStaffService.listForFlat(id, scope);
  }

  @Post('staff/attendance/check-in')
  @RequirePermission('domestic-staff:manage')
  checkIn(@Body() dto: CheckInDto, @CurrentTenantScope() scope: TenantScope) {
    return this.domesticStaffService.checkIn(dto, scope);
  }

  @Post('staff/attendance/check-out')
  @RequirePermission('domestic-staff:manage')
  checkOut(@Body() dto: CheckOutDto, @CurrentTenantScope() scope: TenantScope) {
    return this.domesticStaffService.checkOut(dto, scope);
  }

  @Get('flats/:id/staff/attendance-summary')
  @RequirePermission('domestic-staff:read')
  attendanceSummary(
    @Param('id') id: string,
    @Query('month') month: string,
    @CurrentTenantScope() scope: TenantScope,
  ) {
    return this.domesticStaffService.attendanceSummary(id, month, scope);
  }

  @Post('staff/leave-requests')
  @RequirePermission('domestic-staff:manage')
  createLeaveRequest(@Body() dto: CreateLeaveRequestDto, @CurrentTenantScope() scope: TenantScope) {
    return this.domesticStaffService.createLeaveRequest(dto, scope);
  }

  @Patch('staff/leave-requests/:id/approve')
  @RequirePermission('domestic-staff:manage')
  approveLeaveRequest(@Param('id') id: string, @CurrentTenantScope() scope: TenantScope) {
    return this.domesticStaffService.approveLeaveRequest(id, scope);
  }

  @Patch('staff/:id/police-verification-document')
  @RequirePermission('domestic-staff:manage')
  setPoliceVerificationDocument(
    @Param('id') id: string,
    @Body() dto: SetPoliceVerificationDocumentDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.domesticStaffService.setPoliceVerificationDocument(id, dto, scope, user.userId);
  }

  @Patch('staff/:id/police-verification-status')
  @RequirePermission('domestic-staff:manage')
  setPoliceVerificationStatus(
    @Param('id') id: string,
    @Body() dto: SetPoliceVerificationStatusDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.domesticStaffService.setPoliceVerificationStatus(id, dto, scope, user.userId);
  }

  @Get('staff/:id/police-verification-document')
  @RequirePermission('domestic-staff:manage')
  getPoliceVerificationDocument(
    @Param('id') id: string,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.domesticStaffService.getPoliceVerificationDocument(id, scope, user.userId);
  }
}
