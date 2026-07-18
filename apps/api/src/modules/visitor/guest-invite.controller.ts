import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { GuestInviteService } from './guest-invite.service';
import { CreateGuestInviteDto } from './dto/create-guest-invite.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller('guest-invites')
export class GuestInviteController {
  constructor(private readonly guestInviteService: GuestInviteService) {}

  @Post()
  @RequirePermission('visitor:manage')
  create(
    @Body() dto: CreateGuestInviteDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.guestInviteService.create(dto.flatId, user.userId, dto, scope);
  }

  @Public()
  @Get(':token')
  resolve(@Param('token') token: string) {
    return this.guestInviteService.resolveByToken(token);
  }
}
