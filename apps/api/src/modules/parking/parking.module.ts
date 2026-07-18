import { Module } from '@nestjs/common';
import { TenantScopedTypeOrmModule } from '../../common/tenant-connection/tenant-scoped-typeorm.module';
import { ParkingSlot } from '../../database/entities/parking-slot.entity';
import { ParkingAllocation } from '../../database/entities/parking-allocation.entity';
import { VisitorParkingLog } from '../../database/entities/visitor-parking-log.entity';
import { ParkingViolation } from '../../database/entities/parking-violation.entity';
import { Flat } from '../../database/entities/flat.entity';

import { ParkingController } from './parking.controller';
import { ParkingService } from './parking.service';

import { CLOCK, SystemClock } from '../../common/clock';

@Module({
  imports: [
    TenantScopedTypeOrmModule.forFeature([ParkingSlot, ParkingAllocation, VisitorParkingLog, ParkingViolation, Flat]),
  ],
  controllers: [ParkingController],
  providers: [ParkingService, { provide: CLOCK, useClass: SystemClock }],
  exports: [ParkingService],
})
export class ParkingModule {}
