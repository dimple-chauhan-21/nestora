import { Module } from '@nestjs/common';
import { TenantScopedTypeOrmModule } from '../../common/tenant-connection/tenant-scoped-typeorm.module';
import { Resident } from '../../database/entities/resident.entity';
import { LeaseDetail } from '../../database/entities/lease-detail.entity';
import { Vehicle } from '../../database/entities/vehicle.entity';
import { Pet } from '../../database/entities/pet.entity';
import { ResidentDocument } from '../../database/entities/resident-document.entity';
import { MoveEvent } from '../../database/entities/move-event.entity';
import { Flat } from '../../database/entities/flat.entity';
import { User } from '../../database/entities/user.entity';
import { ResidentController } from './resident.controller';
import { FlatResidentController } from './flat-resident.controller';
import { SocietyResidentController } from './society-resident.controller';
import { ResidentService } from './resident.service';

@Module({
  imports: [
    TenantScopedTypeOrmModule.forFeature([
      Resident,
      LeaseDetail,
      Vehicle,
      Pet,
      ResidentDocument,
      MoveEvent,
      Flat,
      User,
    ]),
  ],
  controllers: [ResidentController, FlatResidentController, SocietyResidentController],
  providers: [ResidentService],
  exports: [ResidentService],
})
export class ResidentModule {}
