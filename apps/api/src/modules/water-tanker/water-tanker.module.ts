import { Module } from '@nestjs/common';
import { WaterTankerController } from './water-tanker.controller';
import { WaterTankerService } from './water-tanker.service';

@Module({
  controllers: [WaterTankerController],
  providers: [WaterTankerService],
  exports: [WaterTankerService],
})
export class WaterTankerModule {}
