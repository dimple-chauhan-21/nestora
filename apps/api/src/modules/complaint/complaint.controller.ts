import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiCreatedResponse, ApiQuery } from '@nestjs/swagger';
import { ComplaintService } from './complaint.service';
import { CreateComplaintCategoryDto } from './dto/create-complaint-category.dto';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { AssignComplaintDto } from './dto/assign-complaint.dto';
import { UpdateComplaintStatusDto } from './dto/update-complaint-status.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { ComplaintResponseDto } from './dto/complaint-response.dto';
import { ComplaintCommentResponseDto } from './dto/complaint-comment-response.dto';
import { AssignableStaffDto } from './dto/assignable-staff.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';
import type { ComplaintPriority, ComplaintStatus } from '../../database/entities/complaint.entity';

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
  @ApiCreatedResponse({ type: ComplaintResponseDto })
  create(
    @Body() dto: CreateComplaintDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ComplaintResponseDto> {
    return this.complaintService.create(dto, scope, user.userId);
  }

  @Get('complaints')
  @RequirePermission('complaint:read')
  @ApiQuery({ name: 'status', required: false, enum: ['open', 'assigned', 'in_progress', 'resolved', 'reopened', 'closed'] })
  @ApiQuery({ name: 'priority', required: false, enum: ['low', 'medium', 'high', 'urgent'] })
  @ApiQuery({ name: 'categoryId', required: false, type: String })
  @ApiQuery({ name: 'flatId', required: false, type: String })
  @ApiOkResponse({ type: [ComplaintResponseDto] })
  list(
    @Query('status') status: ComplaintStatus | undefined,
    @Query('priority') priority: ComplaintPriority | undefined,
    @Query('categoryId') categoryId: string | undefined,
    @Query('flatId') flatId: string | undefined,
    @CurrentTenantScope() scope: TenantScope,
  ): Promise<ComplaintResponseDto[]> {
    return this.complaintService.list({ status, priority, categoryId, flatId }, scope);
  }

  @Get('complaints/:id')
  @RequirePermission('complaint:read')
  @ApiOkResponse({ type: ComplaintResponseDto })
  findById(@Param('id') id: string, @CurrentTenantScope() scope: TenantScope): Promise<ComplaintResponseDto> {
    return this.complaintService.findById(id, scope);
  }

  @Patch('complaints/:id/assign')
  @RequirePermission('complaint:manage')
  @ApiOkResponse({ type: ComplaintResponseDto })
  assign(
    @Param('id') id: string,
    @Body() dto: AssignComplaintDto,
    @CurrentTenantScope() scope: TenantScope,
  ): Promise<ComplaintResponseDto> {
    return this.complaintService.assign(id, dto, scope);
  }

  @Patch('complaints/:id/status')
  @RequirePermission('complaint:manage')
  @ApiOkResponse({ type: ComplaintResponseDto })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateComplaintStatusDto,
    @CurrentTenantScope() scope: TenantScope,
  ): Promise<ComplaintResponseDto> {
    return this.complaintService.updateStatus(id, dto, scope);
  }

  @Post('complaints/:id/comments')
  @RequirePermission('complaint:comment')
  @ApiCreatedResponse({ type: ComplaintCommentResponseDto })
  addComment(
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ComplaintCommentResponseDto> {
    return this.complaintService.addComment(id, dto, scope, user.userId);
  }

  @Get('complaints/:id/comments')
  @RequirePermission('complaint:read')
  @ApiOkResponse({ type: [ComplaintCommentResponseDto] })
  listComments(
    @Param('id') id: string,
    @CurrentTenantScope() scope: TenantScope,
  ): Promise<ComplaintCommentResponseDto[]> {
    return this.complaintService.listComments(id, scope);
  }

  @Post('complaints/:id/feedback')
  @RequirePermission('complaint:comment')
  @ApiCreatedResponse({ type: ComplaintResponseDto })
  submitFeedback(
    @Param('id') id: string,
    @Body() dto: SubmitFeedbackDto,
    @CurrentTenantScope() scope: TenantScope,
  ): Promise<ComplaintResponseDto> {
    return this.complaintService.submitFeedback(id, dto, scope);
  }

  @Get('societies/:id/assignable-staff')
  @RequirePermission('complaint:manage')
  @ApiOkResponse({ type: [AssignableStaffDto] })
  listAssignableStaff(
    @Param('id') id: string,
    @CurrentTenantScope() scope: TenantScope,
  ): Promise<AssignableStaffDto[]> {
    return this.complaintService.listAssignableStaff(id, scope);
  }
}
