import { Body, Controller, Param, Post } from '@nestjs/common';
import { ResidentService } from './resident.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { CreatePetDto } from './dto/create-pet.dto';
import { CreateResidentDocumentDto } from './dto/create-resident-document.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenantScope } from '../../common/decorators/tenant-scope.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { TenantScope } from '../../common/interceptors/tenant-scope.interceptor';

@Controller('residents')
export class ResidentController {
  constructor(private readonly residentService: ResidentService) {}

  @Post(':id/vehicles')
  @RequirePermission('resident:manage')
  createVehicle(
    @Param('id') id: string,
    @Body() dto: CreateVehicleDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.residentService.createVehicle(id, dto, scope, user.userId);
  }

  @Post(':id/pets')
  @RequirePermission('resident:manage')
  createPet(
    @Param('id') id: string,
    @Body() dto: CreatePetDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.residentService.createPet(id, dto, scope, user.userId);
  }

  @Post(':id/documents')
  @RequirePermission('resident:manage')
  createDocument(
    @Param('id') id: string,
    @Body() dto: CreateResidentDocumentDto,
    @CurrentTenantScope() scope: TenantScope,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.residentService.createResidentDocument(id, dto, scope, user.userId);
  }
}
