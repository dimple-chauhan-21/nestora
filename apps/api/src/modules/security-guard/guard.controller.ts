import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { GuardService } from './guard.service';
import { GuardLoginDto } from './dto/guard-login.dto';
import { CallResidentDto } from './dto/call-resident.dto';
import { GuardLoginResponseDto } from './dto/guard-login-response.dto';
import { GuardDashboardResponseDto } from './dto/guard-dashboard-response.dto';
import { CallResidentResponseDto } from './dto/call-resident-response.dto';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import type { RequestContext } from '../auth/auth.service';

function requestContext(req: Request): RequestContext {
  const ua = req.headers['user-agent'];
  return {
    ip: req.ip ?? null,
    userAgent: Array.isArray(ua) ? (ua[0] ?? null) : (ua ?? null),
  };
}

@Controller('guard')
export class GuardController {
  constructor(private readonly guardService: GuardService) {}

  @Public()
  @Post('login')
  @ApiCreatedResponse({ type: GuardLoginResponseDto })
  login(@Body() dto: GuardLoginDto, @Req() req: Request): Promise<GuardLoginResponseDto> {
    return this.guardService.login(dto, requestContext(req));
  }

  @Get('dashboard')
  @RequirePermission('security-guard:manage')
  @ApiOkResponse({ type: GuardDashboardResponseDto })
  getDashboard(
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuardDashboardResponseDto> {
    return this.guardService.getDashboard(scope, user.userId);
  }

  @Get('shift-report')
  @RequirePermission('security-guard:manage')
  getShiftReport(@CurrentTenantScope() scope: TenantScope, @CurrentUser() user: AuthenticatedUser) {
    return this.guardService.getShiftReport(scope, user.userId);
  }
}

@Controller('gate')
export class GateCallController {
  constructor(private readonly guardService: GuardService) {}

  @Post('call-resident')
  @RequirePermission('security-guard:manage')
  @ApiCreatedResponse({ type: CallResidentResponseDto })
  callResident(
    @Body() dto: CallResidentDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CallResidentResponseDto> {
    return this.guardService.callResident(dto, scope, user.userId);
  }
}
