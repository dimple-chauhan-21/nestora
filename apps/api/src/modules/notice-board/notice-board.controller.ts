import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { NoticeBoardService } from './notice-board.service';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { NoticeResponseDto } from './dto/notice-response.dto';
import { NoticeReadResponseDto } from './dto/notice-read-response.dto';
import { NoticeReadReportResponseDto } from './dto/notice-read-report-response.dto';
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
  @ApiCreatedResponse({ type: NoticeResponseDto })
  create(
    @Body() dto: CreateNoticeDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NoticeResponseDto> {
    return this.noticeBoardService.create(dto, scope, user.userId);
  }

  @Get('societies/:id/notices')
  @RequirePermission('notice-board:read')
  @ApiOkResponse({ type: [NoticeResponseDto] })
  listForSociety(
    @Param('id') id: string,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NoticeResponseDto[]> {
    return this.noticeBoardService.listForSociety(id, scope, user.userId);
  }

  @Post('notices/:id/read')
  @RequirePermission('notice-board:read')
  @ApiCreatedResponse({ type: NoticeReadResponseDto })
  markRead(
    @Param('id') id: string,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NoticeReadResponseDto> {
    return this.noticeBoardService.markRead(id, scope, user.userId);
  }

  @Get('notices/:id/read-report')
  @RequirePermission('notice-board:manage')
  @ApiOkResponse({ type: NoticeReadReportResponseDto })
  readReport(@Param('id') id: string, @CurrentTenantScope() scope: TenantScope): Promise<NoticeReadReportResponseDto> {
    return this.noticeBoardService.readReport(id, scope);
  }
}
