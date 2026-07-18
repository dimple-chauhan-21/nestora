import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { GuardService } from './guard.service';
import { GuardLoginDto } from './dto/guard-login.dto';
import { CallResidentDto } from './dto/call-resident.dto';
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
  login(@Body() dto: GuardLoginDto, @Req() req: Request) {
    return this.guardService.login(dto, requestContext(req));
  }

  @Get('dashboard')
  @RequirePermission('security-guard:manage')
  getDashboard(@CurrentTenantScope() scope: TenantScope, @CurrentUser() user: AuthenticatedUser) {
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
  callResident(
    @Body() dto: CallResidentDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.guardService.callResident(dto, scope, user.userId);
  }
}
