import { Module } from '@nestjs/common';
import { TenantScopedTypeOrmModule } from '../../common/tenant-connection/tenant-scoped-typeorm.module';
import { Asset } from '../../database/entities/asset.entity';
import { AssetMaintenanceLog } from '../../database/entities/asset-maintenance-log.entity';

import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

import { CLOCK, SystemClock } from '../../common/clock';

@Module({
  imports: [TenantScopedTypeOrmModule.forFeature([Asset, AssetMaintenanceLog])],
  controllers: [InventoryController],
  providers: [InventoryService, { provide: CLOCK, useClass: SystemClock }],
  exports: [InventoryService],
})
export class InventoryModule {}
