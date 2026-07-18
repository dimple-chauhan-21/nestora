import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { buildUploadOptions, CSV_MIME_TYPES, MAX_CSV_UPLOAD_BYTES } from '../../common/upload/file-validation.util';
import { SocietyService } from './society.service';
import { CreateSocietyDto } from './dto/create-society.dto';
import { UpdateSocietySettingsDto } from './dto/update-society-settings.dto';
import { CreateAmenityDto } from './dto/create-amenity.dto';
import { CreateSocietyDocumentDto } from './dto/create-society-document.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller('societies')
export class SocietyController {
  constructor(private readonly societyService: SocietyService) {}

  @Post()
  @RequirePermission('society:manage')
  create(@Body() dto: CreateSocietyDto, @CurrentUser() user: AuthenticatedUser) {
    return this.societyService.create(dto, user.userId);
  }

  @Get(':id')
  @RequirePermission('society:read')
  findById(@Param('id') id: string, @CurrentTenantScope() scope: TenantScope) {
    return this.societyService.findById(id, scope);
  }

  @Patch(':id/settings')
  @RequirePermission('society:manage')
  updateSettings(
    @Param('id') id: string,
    @Body() dto: UpdateSocietySettingsDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.societyService.updateSettings(id, dto, scope, user.userId);
  }

  @Get(':id/flats')
  @RequirePermission('society:read')
  listFlats(@Param('id') id: string, @CurrentTenantScope() scope: TenantScope) {
    return this.societyService.listFlats(id, scope);
  }

  @Post(':id/flats/bulk-import')
  @RequirePermission('society:manage')
  @UseInterceptors(FileInterceptor('file', buildUploadOptions(CSV_MIME_TYPES, MAX_CSV_UPLOAD_BYTES)))
  bulkImportFlats(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentTenantScope() scope: TenantScope,
  ) {
    return this.societyService.bulkImportFlats(id, file.buffer, scope);
  }

  @Post(':id/amenities')
  @RequirePermission('society:manage')
  createAmenity(
    @Param('id') id: string,
    @Body() dto: CreateAmenityDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.societyService.createAmenity(id, dto, scope, user.userId);
  }

  @Post(':id/documents')
  @RequirePermission('society:manage')
  createDocument(
    @Param('id') id: string,
    @Body() dto: CreateSocietyDocumentDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.societyService.createDocument(id, dto, scope, user.userId);
  }
}
