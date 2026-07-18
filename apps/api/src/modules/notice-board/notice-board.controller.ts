import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { NoticeBoardService } from './notice-board.service';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller()
export class NoticeBoardController {
  constructor(private readonly noticeBoardService: NoticeBoardService) {}

  @Post('notices')
  @RequirePermission('notice-board:manage')
  create(
    @Body() dto: CreateNoticeDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.noticeBoardService.create(dto, scope, user.userId);
  }

  @Get('societies/:id/notices')
  @RequirePermission('notice-board:read')
  listForSociety(
    @Param('id') id: string,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.noticeBoardService.listForSociety(id, scope, user.userId);
  }

  @Post('notices/:id/read')
  @RequirePermission('notice-board:read')
  markRead(
    @Param('id') id: string,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.noticeBoardService.markRead(id, scope, user.userId);
  }

  @Get('notices/:id/read-report')
  @RequirePermission('notice-board:manage')
  readReport(@Param('id') id: string, @CurrentTenantScope() scope: TenantScope) {
    return this.noticeBoardService.readReport(id, scope);
  }
}
