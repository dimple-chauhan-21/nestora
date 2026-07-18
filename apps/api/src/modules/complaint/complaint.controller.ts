import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ComplaintService } from './complaint.service';
import { CreateComplaintCategoryDto } from './dto/create-complaint-category.dto';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { AssignComplaintDto } from './dto/assign-complaint.dto';
import { UpdateComplaintStatusDto } from './dto/update-complaint-status.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import type { ComplaintStatus } from '../../database/entities/complaint.entity';

@Controller()
export class ComplaintController {
  constructor(private readonly complaintService: ComplaintService) {}

  @Post('complaint-categories')
  @RequirePermission('complaint:manage')
  createCategory(@Body() dto: CreateComplaintCategoryDto) {
    return this.complaintService.createCategory(dto);
  }

  @Post('complaints')
  @RequirePermission('complaint:create')
  create(
    @Body() dto: CreateComplaintDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.complaintService.create(dto, scope, user.userId);
  }

  @Get('complaints')
  @RequirePermission('complaint:read')
  list(
    @Query('status') status: ComplaintStatus | undefined,
    @Query('categoryId') categoryId: string | undefined,
    @Query('flatId') flatId: string | undefined,
    @CurrentTenantScope() scope: TenantScope,
  ) {
    return this.complaintService.list({ status, categoryId, flatId }, scope);
  }

  @Patch('complaints/:id/assign')
  @RequirePermission('complaint:manage')
  assign(@Param('id') id: string, @Body() dto: AssignComplaintDto, @CurrentTenantScope() scope: TenantScope) {
    return this.complaintService.assign(id, dto, scope);
  }

  @Patch('complaints/:id/status')
  @RequirePermission('complaint:manage')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateComplaintStatusDto,
    @CurrentTenantScope() scope: TenantScope,
  ) {
    return this.complaintService.updateStatus(id, dto, scope);
  }

  @Post('complaints/:id/comments')
  @RequirePermission('complaint:comment')
  addComment(
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.complaintService.addComment(id, dto, scope, user.userId);
  }

  @Get('complaints/:id/comments')
  @RequirePermission('complaint:read')
  listComments(@Param('id') id: string, @CurrentTenantScope() scope: TenantScope) {
    return this.complaintService.listComments(id, scope);
  }

  @Post('complaints/:id/feedback')
  @RequirePermission('complaint:comment')
  submitFeedback(
    @Param('id') id: string,
    @Body() dto: SubmitFeedbackDto,
    @CurrentTenantScope() scope: TenantScope,
  ) {
    return this.complaintService.submitFeedback(id, dto, scope);
  }
}
