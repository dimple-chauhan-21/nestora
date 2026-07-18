import { Module } from '@nestjs/common';
import { TenantScopedTypeOrmModule } from '../../common/tenant-connection/tenant-scoped-typeorm.module';
import { AmenityMaster } from '../../database/entities/amenity-master.entity';
import { AmenityBookingRule } from '../../database/entities/amenity-booking-rule.entity';
import { Flat } from '../../database/entities/flat.entity';

import { AmenityBookingController } from './amenity-booking.controller';
import { AmenityBookingService } from './amenity-booking.service';

import { CLOCK, SystemClock } from '../../common/clock';

@Module({
  imports: [TenantScopedTypeOrmModule.forFeature([AmenityMaster, AmenityBookingRule, Flat])],
  controllers: [AmenityBookingController],
  providers: [AmenityBookingService, { provide: CLOCK, useClass: SystemClock }],
  exports: [AmenityBookingService],
})
export class AmenityBookingModule {}
