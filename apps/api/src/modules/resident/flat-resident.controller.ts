import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { ResidentService } from './resident.service';
import { CreateResidentDto } from './dto/create-resident.dto';
import { MoveOutDto } from './dto/move-out.dto';
import { FlatDetailResponseDto } from './dto/flat-detail-response.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller('flats')
export class FlatResidentController {
  constructor(private readonly residentService: ResidentService) {}

  @Get(':id')
  @RequirePermission('resident:read')
  @ApiOkResponse({ type: FlatDetailResponseDto })
  getFlatDetail(
    @Param('id') id: string,
    @CurrentTenantScope() scope: TenantScope,
  ): Promise<FlatDetailResponseDto> {
    return this.residentService.getFlatDetail(id, scope);
  }

  @Post(':id/residents')
  @RequirePermission('resident:create')
  createResident(
    @Param('id') id: string,
    @Body() dto: CreateResidentDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.residentService.createResident(id, dto, scope, user.userId);
  }

  @Post(':id/move-out')
  @RequirePermission('resident:manage')
  moveOut(
    @Param('id') id: string,
    @Body() dto: MoveOutDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.residentService.moveOut(id, dto, scope, user.userId);
  }
}
